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

import React, { useMemo, useState, useSyncExternalStore } from "react";
import { Activity, MonitorSmartphone, TriangleAlert, Pause } from "lucide-react";
import { CARD, FIELD_BG, HAIRLINE, PeriodPills, SectionTitle } from "@/components/ui/da";
import { T } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { PALETTE, GREY } from "@/lib/ui/palette";
import { categoryColor, categoryLabel, resolveProductivity } from "@/lib/activity/categories";
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
    ? "Suivi arrêté"
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

/** Cadran du score de focus (0–100). */
export function ScoreDial({ value, size = 132, label = "Score de focus" }) {
  const r = (size - 18) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  const color = pct >= 70 ? PALETTE.green : pct >= 45 ? PALETTE.yellow : PALETTE.red;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} role="img" aria-label={`${label} : ${pct} sur 100`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={FIELD_BG} strokeWidth={12} />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={12}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
            style={{ transition: "stroke-dashoffset 400ms var(--ease-out, ease)" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 28, fontWeight: 600, lineHeight: 1, color: T.text, fontVariantNumeric: "tabular-nums" }}>{pct}</span>
          <span style={{ fontSize: 11, color: T.textSub }}>/ 100</span>
        </div>
      </div>
      <span style={{ fontSize: 12, color: T.textSub }}>{label}</span>
    </div>
  );
}

/* ─── Bandeau de la journée ──────────────────────────────────────────────── */

/**
 * La journée en une ligne : chaque segment mesuré posé à sa place réelle, à sa
 * couleur de catégorie. Les TROUS sont l'information la plus utile du dessin —
 * ce sont les pauses et les absences, qu'aucun total ne montre.
 */
export function TimelineBand({ segments, date, height = 46 }) {
  const now = useNowMinute();
  const { from, to } = useMemo(() => {
    const base = new Date(`${date}T00:00:00`);
    if (!segments.length) {
      const d = new Date(base); d.setHours(8, 0, 0, 0);
      const e = new Date(base); e.setHours(20, 0, 0, 0);
      return { from: d.getTime(), to: e.getTime() };
    }
    const first = new Date(Math.min(...segments.map(s => s.s)));
    const last = new Date(Math.max(...segments.map(s => s.e)));
    first.setMinutes(0, 0, 0);
    const end = new Date(last);
    end.setMinutes(0, 0, 0);
    end.setHours(end.getHours() + 1);
    return { from: first.getTime(), to: end.getTime() };
  }, [segments, date]);

  const span = Math.max(1, to - from);
  const hours = [];
  for (let t = from; t <= to; t += 3600_000) hours.push(t);
  // Une graduation toutes les heures sature en dessous de ~900 px : on en saute
  // une sur deux dès que la journée dépasse dix heures.
  const step = hours.length > 10 ? 2 : 1;

  const showNow = now > 0 && now >= from && now <= to;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative", height, borderRadius: 8, background: FIELD_BG, overflow: "hidden" }}>
        {hours.map((t, i) => i % step === 0 && (
          <div key={t} style={{
            position: "absolute", top: 0, bottom: 0, left: `${((t - from) / span) * 100}%`,
            width: 1, background: HAIRLINE,
          }} />
        ))}
        {segments.map((s, i) => {
          const left = ((s.s - from) / span) * 100;
          const width = ((s.e - s.s) / span) * 100;
          return (
            <div
              key={`${s.s}-${i}`}
              title={`${fmtClock(s.s)} – ${fmtClock(s.e)} · ${s.label} · ${categoryLabel(s.cat)} · ${fmtDur(s.e - s.s)}`}
              style={{
                position: "absolute", top: 0, bottom: 0,
                left: `${left}%`, width: `max(2px, ${width}%)`,
                background: categoryColor(s.cat),
                opacity: 0.92,
              }}
            />
          );
        })}
        {showNow && (
          <div style={{
            position: "absolute", top: 0, bottom: 0, left: `${((now - from) / span) * 100}%`,
            width: 2, background: T.text, opacity: 0.55,
          }} />
        )}
      </div>
      <div style={{ position: "relative", height: 14 }}>
        {hours.map((t, i) => i % step === 0 && (
          <span key={t} style={{
            position: "absolute", left: `${((t - from) / span) * 100}%`, transform: "translateX(-50%)",
            fontSize: 11, color: T.textSub, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
          }}>
            {new Date(t).getHours()}h
          </span>
        ))}
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

/** Répartition par application / site. */
export function AppRows({ apps, limit = 8 }) {
  const [all, setAll] = useState(false);
  const shown = all ? apps : apps.slice(0, limit);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {shown.map(a => (
        <BarRow
          key={a.id}
          color={a.color}
          label={a.label}
          ms={a.ms}
          pct={a.pct}
          sub={a.titles?.[0]?.title ? `${categoryLabel(a.cat)} · ${a.titles[0].title}` : categoryLabel(a.cat)}
        />
      ))}
      {apps.length > limit && (
        <button
          type="button"
          onClick={() => setAll(v => !v)}
          style={{ alignSelf: "flex-start", marginTop: 4, border: "none", background: "transparent", color: T.textSub, fontSize: 12, fontFamily: "inherit", padding: 0 }}
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

export { Activity as ActivityIcon };
