"use client";

/* ============================================================================
   Briques communes aux trois pages « Activité ».

   Elles vivent ici et non dans chaque page parce que la journée, les rapports
   et les règles montrent la MÊME matière sous trois angles : le même bandeau de
   temps, les mêmes pastilles de catégorie, le même état du capteur. Trois copies
   auraient divergé au premier ajustement.

   Direction artistique : `CARD`, `T`, `FIELD_BG` — aucune couleur en dur, sauf
   les couleurs de CATÉGORIE, qui sont des données (cf. lib/activity/categories).
   ========================================================================== */

import React, { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Activity, ChevronDown, MonitorSmartphone, TriangleAlert, Pause } from "lucide-react";
import { CARD, FIELD_BG, HAIRLINE, PeriodPills, SectionTitle } from "@/components/ui/da";
import { BTN } from "@/lib/ui/buttons";
import Popover from "@/components/ui/Popover";
import { T } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { ASSIGNABLE, categoryColor, categoryLabel, resolveProductivity } from "@/lib/activity/categories";
import { fmtClock, fmtDur } from "@/lib/activity/stats";

/* ─── Horloge ────────────────────────────────────────────────────────────
   `Date.now()` lu pendant le rendu est impur : React peut rendre deux fois et
   obtenir deux valeurs. L'heure est donc traitée pour ce qu'elle est — un
   système EXTÉRIEUR auquel on s'abonne — via une source unique, partagée par
   tous les blocs de la section. Un seul intervalle pour toute la page, et la
   durée de la session en cours s'incrémente à l'écran au lieu d'attendre le
   prochain échantillon.
   ---------------------------------------------------------------------- */

const clock = (() => {
  let value = Date.now();
  const subs = new Set();
  let id = null;
  return {
    subscribe(onChange) {
      subs.add(onChange);
      if (id == null) {
        id = setInterval(() => {
          value = Date.now();
          for (const fn of subs) fn();
        }, 1000);
      }
      return () => {
        subs.delete(onChange);
        // Plus personne ne regarde l'heure : on arrête l'intervalle plutôt que
        // de le laisser réveiller l'app en arrière-plan.
        if (subs.size === 0 && id != null) { clearInterval(id); id = null; }
      };
    },
    read: () => value,
    readMinute: () => Math.floor(value / 60_000),
  };
})();

/** L'heure courante en millisecondes, rafraîchie chaque seconde. */
export function useNow() {
  return useSyncExternalStore(clock.subscribe, clock.read, clock.read);
}

/**
 * L'heure courante arrondie à la minute. Le repère « maintenant » du bandeau ne
 * bouge d'aucun pixel entre deux secondes : lire la minute évite un rendu du
 * dessin entier soixante fois par minute.
 */
export function useNowMinute() {
  return useSyncExternalStore(clock.subscribe, clock.readMinute, clock.readMinute) * 60_000;
}

/* ─── Navigation interne ─────────────────────────────────────────────────── */

export const ACTIVITY_TABS = [
  { id: "activity", label: "Journée" },
  { id: "activity-reports", label: "Rapports" },
  { id: "activity-rules", label: "Catégories & règles" },
];

/** Les trois vues de la section, sous forme d'onglets. */
export function ActivityTabs({ page, setPage }) {
  return (
    <PeriodPills
      value={page}
      onChange={(id) => setPage?.(id)}
      options={ACTIVITY_TABS}
      track
      size={13}
    />
  );
}

/* ─── État du capteur ────────────────────────────────────────────────────── */

/** Pastille « en direct » : ce que le poste fait à cette seconde. */
export function LiveBadge({ live }) {
  const now = useNow();
  const running = live?.running;
  const away = live?.away;
  /* Capteur en panne : à distinguer d'une absence. Les deux arrêtent la mesure,
     mais l'un se répare (autorisation, outil manquant) et l'autre non. */
  const broken = running && live?.ok === false && live?.error;
  const color = !running ? GREY.grey500 : broken ? PALETTE.red : away ? PALETTE.yellow : (live?.cat ? categoryColor(live.cat) : PALETTE.green);

  const text = !running
    ? "Suivi en pause"
    : broken
      ? "Capteur indisponible"
      : away
      ? `Absent — ${live.idleSeconds >= 60 ? fmtDur(live.idleSeconds * 1000) : `${live.idleSeconds} s`} sans activité`
      : live?.label
        ? `${live.label} · ${categoryLabel(live.cat)}`
        : "En attente du premier relevé…";

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
      borderRadius: 999, background: FIELD_BG, fontSize: 12, color: T.text, maxWidth: "100%",
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: dotRing(color),
        flexShrink: 0, animation: running && !away ? "tr4de-pulse 2s ease-in-out infinite" : "none",
      }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{text}</span>
      {running && !away && live?.since && now > 0 && (
        <span style={{ color: T.textSub, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
          {fmtDur(now - live.since)}
        </span>
      )}
      <style>{"@keyframes tr4de-pulse{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
    </div>
  );
}

/**
 * Avertissement quand la mesure ne couvre PAS tout le poste. C'est le point le
 * plus important de la section : une page web ne voit que son propre onglet, et
 * afficher « 2 h d'activité » sans le dire ferait passer un onglet pour un PC.
 */
export function SourceNotice({ live }) {
  const web = live && live.full === false;
  const denied = live?.error === "accessibility-denied";
  const missing = live?.error === "xdotool-missing";
  const broken = live && live.full && !live.ok && live.error && !denied && !missing;

  if (!web && !denied && !missing && !broken) return null;

  const rows = [];
  if (web) rows.push({
    icon: MonitorSmartphone,
    title: "Suivi limité à cet onglet",
    body: "Le navigateur ne peut pas voir les autres applications. Installe l'app de bureau tao trade pour mesurer tout le poste (apps, fenêtres, inactivité clavier).",
  });
  if (denied) rows.push({
    icon: TriangleAlert,
    title: "Titres de fenêtres indisponibles",
    body: "macOS demande l'autorisation « Accessibilité » pour lire le titre de la fenêtre active. Réglages système → Confidentialité et sécurité → Accessibilité, puis coche tao trade. Le temps par application, lui, est bien mesuré.",
  });
  if (missing) rows.push({
    icon: TriangleAlert,
    title: "Outils X11 manquants",
    body: "Sur Linux, le suivi passe par xdotool et xprintidle : installe-les (apt install xdotool xprintidle) puis relance l'app.",
  });
  if (broken) rows.push({
    icon: TriangleAlert,
    title: "Le capteur ne répond pas",
    body: `Le relevé natif a échoué (${live.error}). Le temps n'est pas mesuré tant que la cause n'est pas levée.`,
  });

  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12, background: T.amberBg }}>
      {rows.map((r, i) => (
        <div key={r.title} style={{ display: "flex", gap: 10, paddingTop: i ? 12 : 0, borderTop: i ? `1px solid ${HAIRLINE}` : "none" }}>
          <r.icon size={16} color={T.amber} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{r.title}</span>
            <span style={{ fontSize: 12, color: T.textSub, lineHeight: 1.45 }}>{r.body}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Interrupteur ───────────────────────────────────────────────────────── */

export function Toggle({ label, checked, onChange, hint }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange?.(!checked)}
        style={{
          width: 34, height: 20, borderRadius: 999, background: checked ? T.brand : T.border2,
          position: "relative", transition: "background 140ms var(--ease-out, ease)", flexShrink: 0, marginTop: 1,
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 16 : 2, width: 16, height: 16,
          borderRadius: "50%", background: T.white, transition: "left 140ms var(--ease-out, ease)",
        }} />
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, color: T.text }}>{label}</span>
        {hint && <span style={{ fontSize: 11, color: T.textSub, lineHeight: 1.4 }}>{hint}</span>}
      </span>
    </label>
  );
}

/* ─── Mesures ────────────────────────────────────────────────────────────── */

/**
 * Une mesure de la journée : son nom, sa valeur, et — quand un objectif existe —
 * la part parcourue. La jauge n'est pas décorative : « 4 h 12 » ne dit pas si la
 * journée est pleine, « 4 h 12 / 6 h » le dit.
 */
export function KpiTile({ label, value, sub, color, goalMs, valueMs }) {
  const pct = goalMs > 0 && valueMs != null ? Math.min(100, (valueMs / goalMs) * 100) : null;
  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 600, lineHeight: 1, letterSpacing: -0.4, color: color || T.text, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      {pct != null && (
        <div style={{ height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color || T.brand, transition: "width 300ms var(--ease-out, ease)" }} />
        </div>
      )}
      {sub && <span style={{ fontSize: 11, color: T.textSub }}>{sub}</span>}
    </div>
  );
}

/* ─── La journée en calendrier ───────────────────────────────────────────── */

/** Minutes écoulées depuis minuit, pour poser un instant sur la grille. */
function minutesOfDay(ms) {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * La journée mesurée, posée sur une grille horaire — la même que le calendrier
 * de « Agenda », volontairement : c'est le même objet mental (une journée, des
 * heures, des pavés), il doit se lire pareil. Ce qu'on y voit et qu'un total ne
 * dira jamais : la FORME de la journée, et surtout ses TROUS.
 *
 * On ne pose pas les segments bruts (des centaines de traits de deux pixels)
 * mais les pavés de `dayBlocks` : une matière, tant qu'elle dure.
 *
 * La grille ne montre que les heures utiles (première activité − 1 h → dernière
 * + 1 h, plus l'heure courante) : vingt-quatre heures dont dix-huit vides sont
 * dix-huit heures de défilement pour rien.
 */
export function DayColumn({
  blocks, date, onPickBlock,
  /* Exactement la grille de l'agenda : même hauteur utile (`calc(100vh - 210px)`)
     et même hauteur d'heure (68 px). Les deux pages montrent une journée sur des
     heures — les lire à deux échelles différentes obligeait à recalibrer l'œil
     en passant de l'une à l'autre. Conséquence assumée : la carte du jour occupe
     la hauteur de l'écran, et le reste de la page se lit en défilant. */
  height = "calc(100vh - 210px)",
  hourH = 68,
}) {
  const nowMs = useNowMinute();
  const scrollRef = useRef(null);
  const doneRef = useRef(null);

  const today = new Date();
  const isToday = date === `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const nowMin = minutesOfDay(nowMs);

  const { fromH, toH } = useMemo(() => {
    if (!blocks.length) return { fromH: 8, toH: 20 };
    const first = Math.min(...blocks.map(b => minutesOfDay(b.start))) / 60;
    const last = Math.max(...blocks.map(b => minutesOfDay(b.end))) / 60;
    let a = Math.max(0, Math.floor(first) - 1);
    let b = Math.min(24, Math.ceil(last) + 1);
    // Le repère « maintenant » doit rester dans la grille : sans ça, la ligne
    // rouge se pose au bord et ment sur l'heure qu'il est.
    if (isToday) {
      a = Math.min(a, Math.max(0, Math.floor(nowMin / 60) - 1));
      b = Math.max(b, Math.min(24, Math.ceil(nowMin / 60) + 1));
    }
    return { fromH: a, toH: Math.max(a + 3, b) };
  }, [blocks, isToday, nowMin]);

  const hours = Array.from({ length: toH - fromH }, (_, i) => fromH + i);
  const gridH = hours.length * hourH;
  const y = (ms) => ((minutesOfDay(ms) - fromH * 60) / 60) * hourH;

  /* Arrivée directe sur l'heure courante (ou sur le début de la journée quand
     on regarde un jour passé) : avant la première peinture, sans animation —
     on vient voir la fin de la journée, pas la voir défiler depuis 8 h. */
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || doneRef.current === date) return;
    if (el.scrollHeight <= el.clientHeight) { doneRef.current = date; return; }
    const target = isToday ? ((nowMin - fromH * 60) / 60) * hourH - hourH * 1.5 : 0;
    el.scrollTop = Math.max(0, target);
    doneRef.current = date;
  });

  // Trous d'au moins dix minutes : ce sont les pauses, et elles se nomment.
  const gaps = [];
  for (let i = 1; i < blocks.length; i++) {
    const ms = blocks[i].start - blocks[i - 1].end;
    if (ms >= 10 * 60_000) gaps.push({ start: blocks[i - 1].end, end: blocks[i].start, ms });
  }

  return (
    <div
      ref={scrollRef}
      style={{
        overflowY: "auto", maxHeight: height, borderRadius: 10,
        border: `1px solid ${HAIRLINE}`, background: T.white,
      }}
    >
      <div style={{ display: "flex", position: "relative", height: gridH }}>
        {/* Gouttière des heures */}
        <div style={{ width: 44, flexShrink: 0 }}>
          {hours.map((h, i) => (
            <div key={h} style={{ height: hourH, position: "relative" }}>
              {i !== 0 && (
                <span style={{ position: "absolute", top: -7, right: 8, fontSize: 10, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                  {pad2(h)}:00
                </span>
              )}
            </div>
          ))}
        </div>

        {/* La colonne du jour */}
        <div style={{
          flex: 1, position: "relative", minWidth: 0, height: gridH,
          backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${hourH - 1}px, ${HAIRLINE} ${hourH - 1}px, ${HAIRLINE} ${hourH}px)`,
        }}>
          {gaps.map(g => {
            const top = y(g.start);
            const h = Math.max(0, y(g.end) - top);
            return (
              <div
                key={g.start}
                title={`Pause · ${fmtClock(g.start)} – ${fmtClock(g.end)} · ${fmtDur(g.ms)}`}
                style={{
                  position: "absolute", top, height: h, left: 2, right: 2,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                {h >= 20 && (
                  <span style={{ fontSize: 10, color: T.textMut, background: T.white, padding: "0 6px" }}>
                    pause {fmtDur(g.ms, { short: true })}
                  </span>
                )}
              </div>
            );
          })}

          {blocks.map(b => {
            const top = y(b.start);
            const h = Math.max(y(b.end) - top, 5);
            const color = categoryColor(b.cat);
            // Teinte posée sur un fond blanc OPAQUE : sinon les lignes d'heures
            // transparaissent à travers le pavé.
            const tint = `${color}30`;
            return (
              <div
                key={b.start}
                onClick={onPickBlock ? () => onPickBlock(b) : undefined}
                title={`${fmtClock(b.start)} – ${fmtClock(b.end)} · ${categoryLabel(b.cat)} · ${fmtDur(b.ms)}\n${b.apps.map(a => `${a.label} ${fmtDur(a.ms, { short: true })}`).join("\n")}`}
                style={{
                  position: "absolute", top, height: h, left: 2, right: 2,
                  backgroundColor: T.white, backgroundImage: `linear-gradient(${tint}, ${tint})`,
                  borderLeft: `2px solid ${color}`, borderRadius: "var(--radius-field)",
                  padding: h > 16 ? "2px 6px" : "0 6px", overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.10)",
                  display: "flex", flexDirection: h >= 34 ? "column" : "row",
                  alignItems: h >= 34 ? "stretch" : "center", gap: h >= 34 ? 0 : 6,
                  cursor: onPickBlock ? "pointer" : "default",
                }}
              >
                {/* La CATÉGORIE nomme le pavé, pas l'application : la grille
                    répond à « qu'est-ce que j'ai fait de cette heure-là », et
                    « VS Code » ne le dit qu'à celui qui sait déjà. Le détail des
                    applications reste dans l'infobulle. */}
                <span style={{ fontSize: 10, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: h >= 34 ? "none" : 1 }}>
                  {categoryLabel(b.cat)}
                </span>
                {h >= 24 && (
                  <span style={{ fontSize: 10, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {h >= 34 ? `${fmtClock(b.start)} – ${fmtClock(b.end)} · ${fmtDur(b.ms, { short: true })}` : fmtDur(b.ms, { short: true })}
                  </span>
                )}
              </div>
            );
          })}

          {isToday && nowMin >= fromH * 60 && nowMin <= toH * 60 && (
            <div style={{ position: "absolute", top: ((nowMin - fromH * 60) / 60) * hourH, left: 0, right: 0, height: 0, zIndex: 7, pointerEvents: "none" }}>
              <div style={{ position: "absolute", left: -3, top: -3, width: 6, height: 6, borderRadius: "50%", background: T.red }} />
              <div style={{ position: "absolute", left: 1, right: 0, top: -1, height: 2, background: T.red }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Rythme horaire ─────────────────────────────────────────────────────── */

/** 24 colonnes : où le temps productif s'est réellement posé dans la journée. */
export function HourBars({ hourly, height = 96, fromHour = 0, toHour = 23 }) {
  const slice = hourly.filter(h => h.hour >= fromHour && h.hour <= toHour);
  const max = Math.max(1, ...slice.map(h => h.ms));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height, width: "100%" }}>
      {slice.map(h => {
        const neutral = Math.max(0, h.ms - h.productiveMs - h.distractingMs);
        const px = (ms) => (ms / max) * (height - 16);
        return (
          <div key={h.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
            <div
              title={`${h.hour}h — ${fmtDur(h.ms)} (dont ${fmtDur(h.productiveMs)} productif)`}
              style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: height - 16 }}
            >
              <div style={{ height: px(h.distractingMs), background: PALETTE.red, borderRadius: "3px 3px 0 0" }} />
              <div style={{ height: px(neutral), background: GREY.grey500 }} />
              <div style={{ height: px(h.productiveMs), background: PALETTE.green, borderRadius: h.distractingMs || neutral ? 0 : "3px 3px 0 0" }} />
            </div>
            <span style={{ fontSize: 10, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
              {h.hour % 3 === 0 ? h.hour : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Listes ─────────────────────────────────────────────────────────────── */

/** Ligne « pastille · nom · barre · durée » — la forme commune aux répartitions. */
export function BarRow({ color, label, ms, pct, sub, right, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 0", cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: dotRing(color), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {right ?? fmtDur(ms)}
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
          <div style={{ width: `${Math.max(1, Math.min(100, pct))}%`, height: "100%", background: color }} />
        </div>
        {sub && <span style={{ fontSize: 11, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </div>
    </div>
  );
}

/** Répartition par catégorie, avec sa part de productivité. */
export function CategoryRows({ buckets, limit, productivity }) {
  const [all, setAll] = useState(false);
  const shown = all || !limit ? buckets : buckets.slice(0, limit);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {shown.map(b => (
        <BarRow
          key={b.id}
          color={b.color}
          label={b.label}
          ms={b.ms}
          pct={b.pct}
          sub={`${Math.round(b.pct)} % du temps actif · ${PRODUCTIVITY_LABEL[resolveProductivity(b.id, productivity)]}`}
        />
      ))}
      {limit && buckets.length > limit && (
        <button
          type="button"
          onClick={() => setAll(v => !v)}
          style={{ alignSelf: "flex-start", marginTop: 4, border: "none", background: "transparent", color: T.textSub, fontSize: 12, fontFamily: "inherit", padding: 0 }}
        >
          {all ? "Voir moins" : `Voir les ${buckets.length - limit} autres`}
        </button>
      )}
    </div>
  );
}

export const PRODUCTIVITY_LABEL = {
  productive: "productif",
  neutral: "neutre",
  distracting: "distraction",
};

/* ─── Choisir une catégorie ──────────────────────────────────────────────── */

/**
 * La pastille qui porte la catégorie d'une ligne — et qui la CHANGE.
 *
 * C'est la pièce qui manquait : jusqu'ici, corriger un classement demandait
 * d'aller dans une autre page, de deviner quel fragment de texte écrire, et de
 * choisir un champ (« dans l'app » / « dans le titre »). Personne ne le faisait,
 * et « Non classé » restait la première catégorie de la journée. Ici, la
 * correction se fait là où l'erreur se voit, en deux clics, et la règle écrite
 * derrière vise le bon champ toute seule.
 */
export function CategoryPicker({ cat, onPick, label, align = "end" }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const color = categoryColor(cat);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        aria-expanded={open}
        aria-label={`Catégorie : ${categoryLabel(cat)}. Changer.`}
        style={{
          ...BTN.sm, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0,
          border: "none", background: open ? T.rowHighlight : FIELD_BG, color: T.text,
          fontFamily: "inherit", fontSize: 12, cursor: "pointer",
          transition: "background 120ms ease", maxWidth: 200,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: dotRing(color), flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label ?? categoryLabel(cat)}
        </span>
        <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform 140ms var(--ease-out, ease)" }} />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={() => setOpen(false)}
        align={align}
        gap={6}
        minWidth={232}
        maxHeight={320}
        className="anim-pop"
        style={{ background: T.white, borderRadius: 12, boxShadow: "var(--elev-overlay)", border: `1px solid ${T.border}`, padding: 6 }}
      >
        <>
          {ASSIGNABLE.map(c => {
            const on = c.id === cat;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { onPick?.(c.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
                  borderRadius: 8, border: "none", background: on ? T.rowHighlight : "transparent",
                  color: T.text, fontFamily: "inherit", fontSize: 13, textAlign: "left", cursor: "pointer",
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.rowHighlight; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, boxShadow: dotRing(c.color), flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {categoryLabel(c.id)}
                </span>
              </button>
            );
          })}
        </>
      </Popover>
    </>
  );
}

/** Répartition par application / site. `onPick` rend chaque ligne corrigeable. */
export function AppRows({ apps, limit = 8, onPick, empty }) {
  const [all, setAll] = useState(false);
  const shown = all ? apps : apps.slice(0, limit);
  if (!apps.length) {
    return <span style={{ fontSize: 12, color: T.textSub, padding: "8px 0" }}>{empty ?? "Rien à afficher."}</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {shown.map(a => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {fmtDur(a.ms)}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(1, Math.min(100, a.pct))}%`, height: "100%", background: a.color }} />
            </div>
            {a.titles?.[0]?.title && (
              <span title={a.titles[0].title} style={{ fontSize: 11, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.titles[0].title}
              </span>
            )}
          </div>
          {onPick
            ? <CategoryPicker cat={a.cat} onPick={(c) => onPick(a, c)} />
            : <span style={{ fontSize: 11, color: T.textSub, whiteSpace: "nowrap" }}>{categoryLabel(a.cat)}</span>}
        </div>
      ))}
      {apps.length > limit && (
        <button
          type="button"
          onClick={() => setAll(v => !v)}
          style={{ alignSelf: "flex-start", marginTop: 4, border: "none", background: "transparent", color: T.textSub, fontSize: 12, fontFamily: "inherit", padding: 0, cursor: "pointer" }}
        >
          {all ? "Voir moins" : `Voir les ${apps.length - limit} autres`}
        </button>
      )}
    </div>
  );
}

/** Sessions de focus de la journée, dans l'ordre où elles ont eu lieu. */
export function SessionRows({ sessions }) {
  if (!sessions.length) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", fontSize: 12, color: T.textSub }}>
        <Pause size={14} />
        Aucune session de focus aujourd’hui — il en faut une plage continue pour qu’elle compte.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {sessions.map(s => (
        <div key={s.start} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: categoryColor(s.cat), boxShadow: dotRing(categoryColor(s.cat)), flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {fmtClock(s.start)} – {fmtClock(s.end)}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtDur(s.ms)}</span>
        </div>
      ))}
    </div>
  );
}

/** Titre de section avec une mesure à droite. */
export function BlockTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <SectionTitle>{children}</SectionTitle>
      {right && <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>{right}</span>}
    </div>
  );
}

/** En-tête de page commun : onglets, pastille en direct, actions. */
export function ActivityHeader({ page, setPage, live, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <ActivityTabs page={page} setPage={setPage} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {live && <LiveBadge live={live} />}
        {right}
      </div>
    </div>
  );
}

/* ─── Briques de la vue « Journée » ──────────────────────────────────────── */

/**
 * Une mesure, sans carte autour.
 *
 * La page en portait six, chacune dans sa carte : six boîtes pour six nombres,
 * qui pesaient autant à l'œil que le dessin de la journée. Ici la mesure n'est
 * qu'un bloc de texte, posé dans la carte de la journée avec les autres.
 */
export function Metric({ label, value, sub, color, valueMs, goalMs, size = 28 }) {
  const pct = goalMs > 0 && valueMs != null ? Math.min(100, (valueMs / goalMs) * 100) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: "1 1 132px" }}>
      <span style={{ fontSize: 12, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1, letterSpacing: -0.6, color: color || T.text, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      {pct != null && (
        <div style={{ height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden", maxWidth: 168 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color || T.brand, transition: "width 300ms var(--ease-out, ease)" }} />
        </div>
      )}
      {sub && <span style={{ fontSize: 11, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
    </div>
  );
}

/**
 * Une barre à 100 % : la répartition lue d'un coup d'œil, sans légende à
 * traverser. Elle remplace l'anneau — un anneau demande de comparer des angles
 * et vole 170 px de hauteur pour dire ce qu'une barre dit sur une ligne.
 */
export function StackedBar({ parts, height = 12, minPct = 1.2 }) {
  const shown = parts.filter(p => p.pct > 0);
  const total = shown.reduce((n, p) => n + p.pct, 0) || 1;
  return (
    <div style={{ display: "flex", gap: 2, height, width: "100%", borderRadius: 999, overflow: "hidden", background: FIELD_BG }}>
      {shown.map(p => (
        <div
          key={p.id}
          title={`${p.label} · ${fmtDur(p.ms)} · ${Math.round(p.pct)} %`}
          style={{
            // Une part d'une minute doit rester visible : sans plancher, elle
            // disparaît et la barre ment par omission.
            width: `${Math.max(minPct, (p.pct / total) * 100)}%`,
            background: p.color, minWidth: 3,
          }}
        />
      ))}
    </div>
  );
}

/** Légende d'une barre : pastille, nom, durée — sur une seule ligne qui passe. */
export function BarLegend({ parts, limit = 8, onPick }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
      {parts.slice(0, limit).map(p => (
        <span
          key={p.id}
          onClick={onPick ? () => onPick(p) : undefined}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.textSub,
            cursor: onPick ? "pointer" : "default", maxWidth: "100%",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
          <span style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtDur(p.ms, { short: true })}</span>
        </span>
      ))}
    </div>
  );
}

/** Bloc repliable : ce qu'on consulte parfois ne doit pas peser tous les jours. */
export function Disclosure({ title, right, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ ...CARD, padding: 0, display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: 16, border: "none", background: "transparent", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left", width: "100%",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <ChevronDown
            size={15}
            style={{ color: T.textSub, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 140ms var(--ease-out, ease)" }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
        </span>
        {right && <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>{right}</span>}
      </button>
      {open && <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>}
    </div>
  );
}

/**
 * L'interrupteur du suivi, en pastille d'en-tête.
 *
 * Il occupait une carte pleine largeur en haut de la page : la commande qu'on
 * touche une fois par mois avait le même poids que la journée qu'on vient lire.
 */
export function TrackingPill({ enabled, onChange, hint }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange?.(!enabled)}
      title={hint}
      style={{
        ...BTN.sm, display: "inline-flex", alignItems: "center", gap: 7,
        border: "none", background: FIELD_BG, color: T.text,
        fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {enabled
        ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: PALETTE.green, boxShadow: dotRing(PALETTE.green) }} />
        : <Pause size={12} style={{ color: T.textSub }} />}
      {enabled ? "Suivi actif" : "Suivi en pause"}
    </button>
  );
}

export { Activity as ActivityIcon };
