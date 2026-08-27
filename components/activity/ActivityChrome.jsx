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

import React, { useRef, useMemo, useState, useSyncExternalStore } from "react";
import { Activity, ChevronDown, MonitorSmartphone, TriangleAlert, Pause, X } from "lucide-react";
import { CARD, FIELD_BG, HAIRLINE, PeriodPills, SectionTitle } from "@/components/ui/da";
import { BTN } from "@/lib/ui/buttons";
import Popover from "@/components/ui/Popover";
import { T } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { PALETTE, GREY } from "@/lib/ui/palette";
import {
  ASSIGNABLE, categoryColor, categoryLabel, PRODUCTIVITY_COLOR, resolveProductivity,
} from "@/lib/activity/categories";
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
 * mais les pavés de `dayBlocks` : la journée est découpée en créneaux d'une
 * demi-heure, chacun revient à la matière qui l'a le plus occupé, et les
 * créneaux voisins de même matière n'en font qu'un. Un pavé fait donc au moins
 * trente minutes — de quoi porter son nom et son heure — et s'agrandit par
 * demi-heures tant que la matière tient.
 *
 * La grille porte les vingt-quatre heures et défile, comme celle de l'agenda :
 * on n'a pas seulement la fin de sa journée sous les yeux, on peut remonter au
 * matin. Elle s'ouvre sur l'heure courante — ou sur la première activité quand
 * on regarde un jour passé.
 */
export function DayColumn({
  blocks, date, onPickBlock, selected,
  /* Refermer la sélection. Trois gestes y mènent, et il en faut trois : le
     deuxième clic sur le pavé ouvert se devine mal quand le détail s'est
     affiché ailleurs, et rien n'indiquait qu'on pouvait en sortir. */
  onClear,
  /* La grille couvre la JOURNÉE ENTIÈRE, comme celle de l'agenda, et défile :
     on remonte voir le matin, on descend sur le soir. Ce qu'on en voit d'un coup
     est ce qui règle sa taille — le cadre fait exactement `visibleHours` heures,
     ni plus (il mangeait la page) ni moins (on ne situait plus rien). */
  visibleHours = 10,
  /** Hauteur d'une heure — celle de l'agenda, pour que les deux grilles se
   *  lisent à la même échelle. */
  hourH = 68,
}) {
  const nowMs = useNowMinute();
  const scrollRef = useRef(null);
  const doneRef = useRef(null);

  /* Échap referme la sélection — la touche qu'on essaie d'instinct devant un
     panneau ouvert. L'écouteur n'existe que pendant qu'un pavé est ouvert : une
     page qui capte Échap en permanence finit par voler la touche à autre chose
     (une modale, un champ en cours de saisie). */
  React.useEffect(() => {
    if (selected == null || !onClear) return;
    const onKey = (e) => { if (e.key === "Escape") onClear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onClear]);

  const today = new Date();
  const isToday = date === `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const nowMin = minutesOfDay(nowMs);

  const fromH = 0;
  const toH = 24;
  const rowH = hourH;
  const boxH = visibleHours * rowH;

  const hours = Array.from({ length: toH - fromH }, (_, i) => fromH + i);
  const gridH = hours.length * rowH;
  const y = (ms) => ((minutesOfDay(ms) - fromH * 60) / 60) * rowH;

  /* Arrivée directe sur l'heure courante (ou sur le début de la journée quand
     on regarde un jour passé) : avant la première peinture, sans animation —
     on vient voir la fin de la journée, pas la voir défiler depuis 8 h. */
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || doneRef.current === date) return;
    if (el.scrollHeight <= el.clientHeight) { doneRef.current = date; return; }
    // Aujourd'hui : sur l'heure courante, avec un peu de contexte au-dessus.
    // Un jour passé : sur sa première activité — la nuit n'a rien à dire.
    const anchor = isToday
      ? nowMin
      : (blocks.length ? minutesOfDay(Math.min(...blocks.map(b => b.start))) : 8 * 60);
    el.scrollTop = Math.max(0, (anchor / 60) * rowH - rowH * 1.5);
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
        /* Pas de cadre : la carte en tient déjà lieu, et un second contour à
           l'intérieur du premier faisait une boîte dans une boîte. */
        height: boxH, maxHeight: "calc(100vh - 190px)", overflowY: "auto",
        overscrollBehavior: "contain", background: T.white,
      }}
    >
      <div style={{ display: "flex", position: "relative", height: gridH }}>
        {/* Gouttière des heures */}
        <div style={{ width: 44, flexShrink: 0 }}>
          {hours.map((h, i) => (
            <div key={h} style={{ height: rowH, position: "relative" }}>
              {i !== 0 && (
                <span style={{ position: "absolute", top: -7, right: 8, fontSize: 10, color: T.textMut, fontVariantNumeric: "tabular-nums" }}>
                  {pad2(h)}:00
                </span>
              )}
            </div>
          ))}
        </div>

        {/* La colonne du jour.

            Un clic dans son vide referme la sélection. La condition porte sur
            `e.target === e.currentTarget` plutôt que sur un `stopPropagation`
            posé dans chaque pavé : ici c'est le conteneur qui décide, et un
            futur enfant cliquable n'aura pas à se souvenir de bloquer la
            remontée. Les bandeaux de pause et le trait de l'heure courante sont
            déjà en `pointerEvents: none`, donc un clic dessus tombe bien sur le
            conteneur. */}
        <div
          onClick={onClear && selected != null
            ? (e) => { if (e.target === e.currentTarget) onClear(); }
            : undefined}
          style={{
            flex: 1, position: "relative", minWidth: 0, height: gridH,
            backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${rowH - 1}px, ${HAIRLINE} ${rowH - 1}px, ${HAIRLINE} ${rowH}px)`,
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
            const on = selected === b.start;
            // Sélection : le pavé se cerne de sa propre couleur et se remplit un
            // peu plus. Pas d'ombre portée — elle décollerait un pavé de la
            // grille et ferait croire qu'on peut le déplacer.
            const tint = `${color}${on ? "4D" : "30"}`;
            return (
              <div
                key={b.start}
                onClick={onPickBlock ? () => onPickBlock(b) : undefined}
                aria-pressed={onPickBlock ? on : undefined}
                title={`${fmtClock(b.start)} – ${fmtClock(b.end)} · ${categoryLabel(b.cat)} · ${fmtDur(b.ms)}\n${b.apps.map(a => `${a.label} ${fmtDur(a.ms, { short: true })}`).join("\n")}`}
                style={{
                  position: "absolute", top, height: h, left: 2, right: 2,
                  backgroundColor: T.white, backgroundImage: `linear-gradient(${tint}, ${tint})`,
                  borderLeft: `${on ? 3 : 2}px solid ${color}`, borderRadius: "var(--radius-field)",
                  padding: h > 16 ? "2px 6px" : "0 6px", overflow: "hidden",
                  boxShadow: on ? `0 0 0 2px ${color}` : "0 1px 3px rgba(0,0,0,0.10)",
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
            <div style={{ position: "absolute", top: ((nowMin - fromH * 60) / 60) * rowH, left: 0, right: 0, height: 0, zIndex: 7, pointerEvents: "none" }}>
              <div style={{ position: "absolute", left: -3, top: -3, width: 6, height: 6, borderRadius: "50%", background: T.red }} />
              <div style={{ position: "absolute", left: 1, right: 0, top: -1, height: 2, background: T.red }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Le détail d'un pavé : tout ce qui a été ouvert pendant ce laps de temps.
 *
 * C'est la réponse à la question qu'on se pose en regardant la grille — « cette
 * heure et demie, c'était quoi au juste ? ». Le pavé porte une matière et une
 * app dominante ; ici on ouvre la boîte : chaque application, chaque site, avec
 * son temps, sa part du pavé, et les fenêtres qu'on y a eues. Chaque ligne se
 * range depuis là, comme dans l'onglet « Applications » — c'est souvent en
 * lisant un pavé qu'on repère un classement faux.
 */
export function BlockDetail({ block, activeMs, onClose, onPick }) {
  const color = categoryColor(block.cat);
  const share = activeMs > 0 ? (block.ms / activeMs) * 100 : 0;
  // Le pavé absorbe les passages courts sur autre chose : ils gardent LEUR
  // couleur dans la liste, sinon le détail dirait le contraire du classement.
  const strays = block.apps.filter(a => a.cat !== block.cat).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: dotRing(color), flexShrink: 0, marginTop: 5 }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{categoryLabel(block.cat)}</span>
          <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
            {fmtClock(block.start)} – {fmtClock(block.end)} · {fmtDur(block.ms)} mesurées · {Math.round(share)} % de la journée
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Revenir au résumé de la journée"
          style={{
            ...BTN.sm, border: "none", background: FIELD_BG, color: T.text,
            fontFamily: "inherit", fontSize: 12, cursor: "pointer", display: "inline-flex",
            alignItems: "center", gap: 6, flexShrink: 0,
          }}
        >
          <X size={13} /> Résumé
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 11, color: T.textSub }}>
        <span>{block.apps.length} application{block.apps.length > 1 ? "s" : ""}</span>
        <span>{block.switches} bascule{block.switches > 1 ? "s" : ""}</span>
        <span>Durée d’horloge <strong style={{ color: T.text, fontWeight: 600 }}>{fmtDur(block.end - block.start)}</strong></span>
        {strays > 0 && <span style={{ color: T.textMut }}>dont {strays} passage{strays > 1 ? "s" : ""} d’une autre catégorie</span>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
        {block.apps.map(a => {
          const pct = block.ms > 0 ? (a.ms / block.ms) * 100 : 0;
          const appColor = categoryColor(a.cat);
          return (
            <div key={a.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: `1px solid ${HAIRLINE}` }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmtDur(a.ms)}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(1, Math.min(100, pct))}%`, height: "100%", background: appColor }} />
                </div>
                {/* Les fenêtres vues : c'est ce qui dit ce qu'on FAISAIT, pas
                    seulement dans quoi on le faisait. */}
                {a.titles.slice(0, 3).map(t => (
                  <span key={t.title} title={t.title} style={{ fontSize: 11, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title} <span style={{ color: T.textMut, fontVariantNumeric: "tabular-nums" }}>{fmtDur(t.ms, { short: true })}</span>
                  </span>
                ))}
                {a.titles.length > 3 && (
                  <span style={{ fontSize: 11, color: T.textMut }}>+ {a.titles.length - 3} autre{a.titles.length - 3 > 1 ? "s" : ""} fenêtre{a.titles.length - 3 > 1 ? "s" : ""}</span>
                )}
              </div>
              {onPick && <CategoryPicker cat={a.cat} onPick={(c) => onPick(a, c)} />}
            </div>
          );
        })}
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
              <div style={{ height: px(h.distractingMs), background: PRODUCTIVITY_COLOR.distracting, borderRadius: "3px 3px 0 0" }} />
              <div style={{ height: px(neutral), background: PRODUCTIVITY_COLOR.neutral }} />
              <div style={{ height: px(h.productiveMs), background: PRODUCTIVITY_COLOR.productive, borderRadius: h.distractingMs || neutral ? 0 : "3px 3px 0 0" }} />
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

/* ─── Temps d'écran, jour par jour ───────────────────────────────────────── */

const WEEKDAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"];

/**
 * Une colonne par jour : le temps d'écran de la semaine, d'un coup d'œil.
 *
 * Une journée seule ne dit pas si elle est longue — « 6 h 12 » n'a de sens que
 * posé à côté des six précédentes. La colonne empile la NATURE du temps
 * (productif, neutre, distraction) plutôt que les catégories : sur 40 px de
 * large, six teintes ne se distinguent pas, et c'est de toute façon la question
 * qu'on se pose en comparant des jours.
 *
 * Chaque colonne est cliquable — c'est le raccourci naturel pour aller lire la
 * journée qu'on vient de repérer.
 */
export function ScreenTimeBars({ days, goalMs = 0, medianMs = 0, selected, onPick, height = 260 }) {
  const max = Math.max(1, ...days.map(d => d.activeMs), goalMs, medianMs);
  const px = (ms) => (ms / max) * height;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height, position: "relative" }}>
        {goalMs > 0 && goalMs <= max && (
          <div
            title={`Objectif : ${fmtDur(goalMs)}`}
            style={{
              position: "absolute", left: 0, right: 0, bottom: px(goalMs),
              borderTop: `1px dotted ${T.border2}`, pointerEvents: "none",
            }}
          />
        )}
        {/* La médiane plutôt que la moyenne : une seule journée de quinze heures
            tire une moyenne hebdomadaire vers le haut et fait passer une semaine
            calme pour une semaine chargée. La médiane dit la journée ORDINAIRE. */}
        {medianMs > 0 && (
          <div
            title={`Usage médian : ${fmtDur(medianMs)}`}
            style={{
              position: "absolute", left: 0, right: 0, bottom: px(medianMs),
              borderTop: `1px dashed ${T.textMut}`, pointerEvents: "none",
            }}
          >
            <span style={{
              position: "absolute", right: 0, top: -14, fontSize: 10, color: T.textMut,
              background: T.white, padding: "0 4px",
            }}>
              médiane
            </span>
          </div>
        )}
        {days.map(d => {
          const on = d.date === selected;
          const neutral = Math.max(0, d.activeMs - d.productiveMs - d.distractingMs);
          const parts = [
            { id: "d", ms: d.distractingMs, color: PRODUCTIVITY_COLOR.distracting },
            { id: "n", ms: neutral, color: PRODUCTIVITY_COLOR.neutral },
            { id: "p", ms: d.productiveMs, color: PRODUCTIVITY_COLOR.productive },
          ].filter(p => p.ms > 0);
          return (
            <div
              key={d.date}
              onClick={onPick ? () => onPick(d.date) : undefined}
              title={`${new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} — ${fmtDur(d.activeMs)}`}
              style={{
                flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end",
                cursor: onPick ? "pointer" : "default",
                // Le jour lu se distingue par la NETTETÉ, pas par une couleur de
                // plus : les autres reculent, lui reste au premier plan.
                opacity: !selected || on ? 1 : 0.55,
              }}
            >
              {/* La barre est plus étroite que sa colonne : c'est la colonne qui
                  reste cliquable sur toute sa largeur (une cible de 26 px se
                  rate), et le dessin qui s'affine. */}
              <div style={{
                width: "92%", maxWidth: 56, height: "100%", display: "flex",
                flexDirection: "column", justifyContent: "flex-end",
              }}>
                {parts.length === 0 ? (
                  <div style={{ height: 2, background: FIELD_BG, borderRadius: 999 }} />
                ) : (
                  parts.map((p, i) => (
                    <div key={p.id} style={{
                      height: Math.max(2, px(p.ms)), background: p.color,
                      borderRadius: i === 0 ? "4px 4px 0 0" : 0,
                    }} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {days.map(d => {
          const jd = new Date(`${d.date}T00:00:00`);
          const on = d.date === selected;
          /* L'initiale du jour, et rien d'autre : « L25 M26 M27 » demandait de
             lire un nombre pour retrouver un jour qu'une lettre suffit à nommer.
             Le jour affiché se reconnaît à sa graisse, pas à une mention. */
          return (
            <span
              key={d.date}
              style={{
                flex: 1, minWidth: 0, textAlign: "center", fontSize: 10,
                color: on ? T.text : T.textSub, fontWeight: on ? 600 : 400,
                fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden",
              }}
            >
              {WEEKDAY_LETTER[jd.getDay()]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Listes ─────────────────────────────────────────────────────────────── */

/**
 * Ligne « nom · barre · durée » — la forme commune aux répartitions.
 *
 * Sans pastille à gauche. Elle disait la couleur de la catégorie, mais la BARRE
 * la dit déjà, sur toute la largeur de la ligne et en plus grand : deux fois la
 * même information, dont l'une prenait le début de chaque nom. Le lien avec
 * l'anneau tient par la barre.
 */
export function BarRow({ color, label, ms, pct, sub, right, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "7px 0", cursor: onClick ? "pointer" : "default",
      }}
    >
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

/**
 * Répartition par catégorie.
 *
 * `showShare` coupe la ligne sous la barre (« 38 % du temps actif · productif »).
 * Elle a sa place dans une liste qu'on vient éplucher ; à côté d'un anneau qui
 * dit déjà les parts, elle triple la hauteur d'une ligne pour la répéter.
 */
export function CategoryRows({ buckets, limit, productivity, showShare = true }) {
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
          sub={showShare
            ? `${Math.round(b.pct)} % du temps actif · ${PRODUCTIVITY_LABEL[resolveProductivity(b.id, productivity)]}`
            : null}
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

/**
 * Part arrondie, sans jamais écrire « 0 % » sur un temps qui existe : une
 * application vue trois minutes sur six heures vaut « <1 % », pas rien.
 */
function pctLabel(pct) {
  if (pct <= 0) return null;
  return pct < 1 ? "<1 %" : `${Math.round(pct)} %`;
}

/**
 * Répartition par application / site. `onPick` rend chaque ligne corrigeable.
 *
 * `minMs` écarte les miettes — les applications ouvertes deux minutes qu'une
 * journée normale accumule par dizaines. Elles ne sont pas repoussées derrière
 * « voir plus », elles sont RETIRÉES : une liste qu'on déplie pour y trouver
 * trente lignes d'une minute n'apprend rien, et la longueur du dépliage laisse
 * croire qu'il y a quelque chose à y lire.
 *
 * Le tri ne s'applique qu'au-delà de `limit`, c'est-à-dire exactement quand un
 * « voir plus » apparaîtrait. En deçà, tout tient déjà à l'écran et il n'y a
 * rien à nettoyer — masquer une ligne sur quatre serait de la perte sèche.
 */
export function AppRows({ apps, limit = 8, onPick = null, empty = null, minMs = 0 }) {
  const [all, setAll] = useState(false);

  const kept = useMemo(() => {
    if (!minMs || apps.length <= limit) return apps;
    const long = apps.filter(a => a.ms >= minMs);
    /* Une journée entière faite de miettes existe : tout retirer afficherait
       « rien à afficher » sur des heures bien réelles. Dans ce cas, la liste
       brute vaut mieux que le vide. */
    return long.length ? long : apps;
  }, [apps, limit, minMs]);

  const hidden = apps.length - kept.length;
  const shown = all ? kept : kept.slice(0, limit);
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
                {/* La part du temps suivi : « 1 h 00 » ne dit pas si c'est la
                    moitié de la journée ou un dixième. */}
                <span style={{ color: T.textSub, fontWeight: 500 }}> · {pctLabel(a.pct)}</span>
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
          {/* La catégorie n'est répétée à droite que là où elle se CHANGE. En
              lecture seule elle ne servait à rien : la couleur de la barre la
              dit déjà, l'anneau juste au-dessus la dit en grand, et le nom
              répété rognait la place du titre de fenêtre — la seule ligne qui
              apprenne quelque chose. */}
          {onPick && <CategoryPicker cat={a.cat} onPick={(c) => onPick(a, c)} />}
        </div>
      ))}
      {kept.length > limit && (
        <button
          type="button"
          onClick={() => setAll(v => !v)}
          style={{ alignSelf: "flex-start", marginTop: 4, border: "none", background: "transparent", color: T.textSub, fontSize: 12, fontFamily: "inherit", padding: 0, cursor: "pointer" }}
        >
          {all ? "Voir moins" : `Voir les ${kept.length - limit} autres`}
        </button>
      )}
      {/* Ce qui a été retiré est DIT, en une ligne. Sans elle, les parts ne
          totalisent plus cent pour cent sans qu'on sache pourquoi, et la
          différence passe pour une erreur de mesure. */}
      {hidden > 0 && (
        <span style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>
          {hidden} sous {fmtDur(minMs)} masquée{hidden > 1 ? "s" : ""}.
        </span>
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
export function Metric({ label, value, sub, color, valueMs, goalMs, size = 28, labelSize = 13, subSize = 12 }) {
  const pct = goalMs > 0 && valueMs != null ? Math.min(100, (valueMs / goalMs) * 100) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, flex: "1 1 132px" }}>
      <span style={{ fontSize: labelSize, color: T.textSub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1, letterSpacing: -0.6, color: color || T.text, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      {pct != null && (
        <div style={{ height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden", maxWidth: 168 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color || T.brand, transition: "width 300ms var(--ease-out, ease)" }} />
        </div>
      )}
      {sub && <span style={{ fontSize: subSize, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
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
