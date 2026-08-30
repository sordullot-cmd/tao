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
import { createPortal } from "react-dom";
import { Activity, ChevronDown, MonitorSmartphone, TriangleAlert, Pause, X } from "lucide-react";
import { CARD, FIELD_BG, HAIRLINE, PeriodPills, SectionTitle } from "@/components/ui/da";
import { BTN } from "@/lib/ui/buttons";
import Popover from "@/components/ui/Popover";
import { T } from "@/lib/ui/tokens";
import { dotRing } from "@/lib/ui/color";
import { HUE, PALETTE, PALETTE_DARK, PALETTE_LIGHT, GREY } from "@/lib/ui/palette";
import {
  assignableCategories, categoryColor, categoryLabel, PRODUCTIVITY_COLOR, resolveProductivity,
} from "@/lib/activity/categories";
import { fmtClock, fmtDur, ranked, SHOWN_MIN_MS } from "@/lib/activity/stats";

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
    title: "Sur cet appareil, seul tao trade est mesuré",
    body: "Une page web ne voit pas les autres applications : le temps passé ici est enregistré, le reste échappe à la mesure. Ta journée réunit tous tes appareils, et l'app de bureau passe devant quand deux d'entre eux tournaient en même temps — c'est la seule à savoir nommer l'application.",
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
export function BlockDetail({ block, activeMs, onClose, onPick, blocked }) {
  const color = categoryColor(block.cat);
  const share = activeMs > 0 ? (block.ms / activeMs) * 100 : 0;
  const apps = ranked(block.apps);
  const hidden = block.apps.length - apps.length;
  // Le pavé absorbe les passages courts sur autre chose : ils gardent LEUR
  // couleur dans la liste, sinon le détail dirait le contraire du classement.
  const strays = apps.filter(a => a.cat !== block.cat).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }} />
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
        <span>{apps.length} application{apps.length > 1 ? "s" : ""}</span>
        <span>{block.switches} bascule{block.switches > 1 ? "s" : ""}</span>
        <span>Durée d’horloge <strong style={{ color: T.text, fontWeight: 600 }}>{fmtDur(block.end - block.start)}</strong></span>
        {strays > 0 && <span style={{ color: T.textMut }}>dont {strays} passage{strays > 1 ? "s" : ""} d’une autre catégorie</span>}
        {/* Ce qui est masqué se DIT : une liste tronquée en silence se lit
            comme une liste complète. */}
        <CrumbNote count={hidden} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", minHeight: 0 }}>
        {apps.length === 0 && (
          <span style={{ fontSize: 12, color: T.textSub, padding: "8px 0" }}>
            Rien n’a dépassé cinq minutes sur ce pavé — le temps s’y est éparpillé.
          </span>
        )}
        {apps.map(a => {
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
              {onPick && <PickCell app={a} onPick={onPick} blocked={blocked} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Infobulle des figures ──────────────────────────────────────────────── */

/* Ce que le survol doit rendre, et que l'infobulle NATIVE du navigateur ne
   rendait pas : elle met une seconde à venir, ne se met pas en forme (on ne
   peut donc pas y aligner trois durées en colonne), et ne dit rien pendant ce
   temps de ce que la souris désigne. Une colonne de graphe est une cible de
   quelques pixels — sans accusé de réception, on ne sait pas si on est
   dessus. D'où un calque à nous, ouvert au premier pixel, doublé d'un
   surlignage de la cible.

   Le calque est portalisé et `position: fixed` sur le curseur : les figures
   vivent dans des cartes qui défilent et qui coupent leur débord, une bulle
   posée dans le flux serait tronquée par la première d'entre elles. */

const TIP_MAX_W = 260;

function ChartTip({ tip }) {
  if (!tip || typeof document === "undefined") return null;
  // Retournement au ras des bords, sans mesurer : la largeur est plafonnée, il
  // suffit de savoir de quel côté du curseur la bulle tient encore.
  const flipX = tip.x > window.innerWidth - (TIP_MAX_W + 24);
  const flipY = tip.y < 140;
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: flipX ? tip.x - 14 : tip.x + 14,
        top: flipY ? tip.y + 20 : tip.y - 14,
        transform: `${flipX ? "translateX(-100%)" : ""} ${flipY ? "" : "translateY(-100%)"}`,
        maxWidth: TIP_MAX_W,
        background: T.white,
        borderRadius: 10,
        padding: "8px 10px",
        boxShadow: "var(--elev-overlay)",
        // Sans ça, la bulle passe sous le curseur et vole le survol à la
        // colonne qui l'a ouverte : elle clignoterait indéfiniment.
        pointerEvents: "none",
        zIndex: 10050,
        fontFamily: "var(--font-sans)",
      }}
    >
      {tip.content}
    </div>,
    document.body,
  );
}

/**
 * Survol d'une figure : quelle cible est désignée, et la bulle qui la décrit.
 *
 * `show` est branché sur `onMouseMove` et pas seulement sur `onMouseEnter` : la
 * bulle suit le curseur le long d'une barre, sinon elle reste plantée là où on
 * est entré et finit par recouvrir ce qu'on regarde.
 */
export function useChartTip() {
  const [tip, setTip] = useState(null);
  /* Part ÉPINGLÉE : ce qu'on a cliqué reste affiché quand la souris s'en va.
     Lire un détail obligeait sinon à garder le curseur immobile sur une part de
     quelques pixels — impossible dès qu'on veut parcourir la liste des yeux, et
     perdu au moindre tremblement. */
  const [pin, setPin] = useState(null);
  const shown = pin || tip;

  /* Sortir de la sélection : Échap, ou un clic AILLEURS. Les deux gestes qu'on
     essaie d'instinct. Les écouteurs n'existent que pendant l'épinglage — une
     page qui capte Échap en permanence finit par voler la touche à une modale
     ou à un champ en cours de saisie.
     `mousedown` en capture, et non `click` : le clic qui suit sur une autre
     part doit pouvoir l'épingler à son tour, pas se faire annuler par la
     fermeture. D'où le marqueur `data-chart-part`, posé sur tout ce qui est
     une part de figure ou son détail — cliquer dedans ne libère rien. */
  React.useEffect(() => {
    if (!pin) return;
    const onKey = (e) => { if (e.key === "Escape") setPin(null); };
    const onDown = (e) => { if (!e.target?.closest?.("[data-chart-part]")) setPin(null); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [pin]);

  return {
    /** Cible désignée : celle qu'on a épinglée, sinon celle qu'on survole. */
    key: shown ? shown.key : null,
    /** Vrai quand la cible est FIGÉE — la figure peut le marquer autrement. */
    pinned: !!pin,
    show: (e, key, content) => { if (!pin) setTip({ x: e.clientX, y: e.clientY, key, content }); },
    hide: () => { if (!pin) setTip(null); },
    /** Clic sur une part qui porte une bulle : épingle, ou libère si c'est la même. */
    pin: (e, key, content) => setPin(p => (p && p.key === key ? null : { x: e.clientX, y: e.clientY, key, content })),
    /** Survol d'une part SANS bulle (l'anneau, qui écrit à son centre). */
    hoverKey: (key) => { if (!pin) setTip(key == null ? null : { key }); },
    /** Clic sur une part SANS bulle. */
    select: (key) => setPin(p => (p && p.key === key ? null : { key })),
    /** À poser dans le rendu de la figure : le calque lui-même. */
    node: <ChartTip tip={shown && shown.content ? shown : null} />,
  };
}

/** Titre d'une infobulle — ce que la cible est. */
export function TipTitle({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4, whiteSpace: "nowrap" }}>
      {children}
    </div>
  );
}

/** Ligne « pastille · libellé · valeur » d'une infobulle. */
export function TipLine({ color, label, value, strong }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, whiteSpace: "nowrap" }}>
      {color
        ? <span style={{ width: 8, height: 8, borderRadius: 2, background: color, boxShadow: dotRing(color), flexShrink: 0 }} />
        : <span style={{ width: 8, flexShrink: 0 }} />}
      <span style={{ fontSize: 11, color: strong ? T.text : T.textSub, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: strong ? 600 : 500, color: T.text,
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}

/* La ventilation productif / neutre / distraction, identique dans toutes les
   bulles de la section : c'est la même question qu'on se pose devant une heure,
   devant un jour et devant une part. */
function productivityLines(ms, productiveMs, distractingMs) {
  const neutral = Math.max(0, ms - productiveMs - distractingMs);
  return (
    <>
      {productiveMs > 0 && <TipLine color={PRODUCTIVITY_COLOR.productive} label="Productif" value={fmtDur(productiveMs)} />}
      {neutral > 0 && <TipLine color={PRODUCTIVITY_COLOR.neutral} label="Neutre" value={fmtDur(neutral)} />}
      {distractingMs > 0 && <TipLine color={PRODUCTIVITY_COLOR.distracting} label="Distraction" value={fmtDur(distractingMs)} />}
    </>
  );
}

/* ─── Rythme horaire ─────────────────────────────────────────────────────── */

/** 24 colonnes : où le temps productif s'est réellement posé dans la journée. */
export function HourBars({ hourly, height = 96, fromHour = 0, toHour = 23 }) {
  const slice = hourly.filter(h => h.hour >= fromHour && h.hour <= toHour);
  const max = Math.max(1, ...slice.map(h => h.ms));
  const tip = useChartTip();
  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap: 3, height, width: "100%" }}
      onMouseLeave={tip.hide}
    >
      {slice.map(h => {
        const neutral = Math.max(0, h.ms - h.productiveMs - h.distractingMs);
        const px = (ms) => (ms / max) * (height - 16);
        const on = tip.key === h.hour;
        /* Ce sont les VOISINES qui reculent, jamais la désignée qui s'assombrit
           — la même règle que la barre de répartition et que l'anneau. Un fond
           posé derrière la colonne teintait aussi sa partie vide, c'est-à-dire
           la moitié de la figure : on croyait lire une valeur là où il n'y avait
           que du vide colorié.
           Une heure vide n'a pas de barre, et n'en a pas besoin : tout le reste
           s'efface autour d'elle, ce qui se voit très bien — or « rien entre
           3 h et 4 h » est une réponse. */
        const dim = tip.key != null && !on;
        const content = (
          <>
            <TipTitle>{`${pad2(h.hour)} h – ${pad2((h.hour + 1) % 24)} h`}</TipTitle>
            {h.ms > 0
              ? <>
                  {productivityLines(h.ms, h.productiveMs, h.distractingMs)}
                  <TipLine label="Total" value={fmtDur(h.ms)} strong />
                </>
              : <TipLine label="Rien de mesuré" value="—" />}
          </>
        );
        const hover = (e) => tip.show(e, h.hour, content);
        return (
          <div
            key={h.hour}
            data-chart-part
            onMouseEnter={hover}
            onMouseMove={hover}
            onClick={(e) => tip.pin(e, h.hour, content)}
            /* Nommée : une colonne de graphe n'a aucun texte à elle, et sans ce
               libellé la figure ne dit rien d'autre que sa forme. */
            aria-label={`${pad2(h.hour)} h — ${fmtDur(h.ms)}`}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0,
              opacity: dim ? 0.4 : 1,
              cursor: "pointer",
              transition: "opacity .12s ease",
            }}
          >
            <div style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", height: height - 16 }}>
              <div style={{ height: px(h.distractingMs), background: PRODUCTIVITY_COLOR.distracting, borderRadius: "3px 3px 0 0" }} />
              <div style={{ height: px(neutral), background: PRODUCTIVITY_COLOR.neutral }} />
              <div style={{ height: px(h.productiveMs), background: PRODUCTIVITY_COLOR.productive, borderRadius: h.distractingMs || neutral ? 0 : "3px 3px 0 0" }} />
            </div>
            <span style={{ fontSize: 10, color: on ? T.text : T.textSub, fontVariantNumeric: "tabular-nums" }}>
              {h.hour % 3 === 0 ? h.hour : ""}
            </span>
          </div>
        );
      })}
      {tip.node}
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
  const tip = useChartTip();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: 14, height, position: "relative" }}
        onMouseLeave={tip.hide}
      >
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
          const neutral = Math.max(0, d.activeMs - d.productiveMs - d.distractingMs);
          const parts = [
            { id: "d", ms: d.distractingMs, color: PRODUCTIVITY_COLOR.distracting },
            { id: "n", ms: neutral, color: PRODUCTIVITY_COLOR.neutral },
            { id: "p", ms: d.productiveMs, color: PRODUCTIVITY_COLOR.productive },
          ].filter(p => p.ms > 0);
          const label = new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
          const lit = tip.key === d.date;
          const dim = tip.key != null && !lit;
          const hover = (e) => tip.show(e, d.date, (
            <>
              <TipTitle>{label}</TipTitle>
              {d.activeMs > 0
                ? <>
                    {productivityLines(d.activeMs, d.productiveMs, d.distractingMs)}
                    <TipLine label="Temps d'écran" value={fmtDur(d.activeMs)} strong />
                  </>
                : <TipLine label="Rien de mesuré" value="—" />}
            </>
          ));
          return (
            <div
              key={d.date}
              onClick={onPick ? () => onPick(d.date) : undefined}
              onMouseEnter={hover}
              onMouseMove={hover}
              /* Le libellé reste lisible aux lecteurs d'écran et aux tests, mais
                 PAS en `title` : l'infobulle native doublerait la bulle. */
              aria-label={`${label} — ${fmtDur(d.activeMs)}`}
              style={{
                flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "flex-end",
                cursor: onPick ? "pointer" : "default",
                /* Au repos, TOUTES les colonnes sont à pleine encre : une figure
                   qu'on regarde sans rien survoler n'a aucune raison d'être à
                   moitié éteinte. C'est le survol qui trie — la désignée reste,
                   les autres reculent — et non la sélection, qui laissait la
                   semaine grisée en permanence et faisait passer le survol pour
                   un éclaircissement.
                   Le jour lu, lui, se reconnaît à son initiale en dessous : une
                   marque qui ne coûte pas la lisibilité des six autres. */
                opacity: dim ? 0.4 : 1,
                transition: "opacity .12s ease",
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
        {tip.node}
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        {days.map(d => {
          const jd = new Date(`${d.date}T00:00:00`);
          const on = d.date === selected;
          const dim = tip.key != null && tip.key !== d.date;
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
                opacity: dim ? 0.4 : 1,
                transition: "opacity .12s ease",
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
export function BarRow({ color, label, ms, pct, sub, right, onClick, details }) {
  const tip = useChartTip();
  /* La ligne dit la durée mais pas la part exacte (la page Journée coupe le
     « 38 % du temps actif » pour tenir en hauteur) : c'est elle que le survol
     vient chercher, avec la durée à la seconde près — et, quand l'appelant les
     fournit, ce qui compose la ligne : une catégorie ne dit rien tant qu'on ne
     sait pas quelles applications et quels sites l'ont remplie. */
  const content = (
    <>
      <TipTitle>{label}</TipTitle>
      <TipLine
        color={color}
        label="Durée"
        value={`${fmtDur(ms)}${Number.isFinite(pct) ? ` · ${Math.round(pct * 10) / 10} %` : ""}`}
        strong
      />
      {(details || []).map(d => (
        <TipLine key={d.label} label={d.label} value={fmtDur(d.ms, { short: true })} />
      ))}
    </>
  );
  const hover = (e) => tip.show(e, "row", content);
  return (
    <div
      /* Pas d'épinglage au clic ici, contrairement aux figures : une ligne de
         liste porte déjà son nom et sa durée en clair, et une bulle qui reste
         plantée devant la liste qu'on est en train de parcourir gêne plus
         qu'elle n'aide. Le survol suffit. */
      onClick={onClick}
      onMouseEnter={hover}
      onMouseMove={hover}
      onMouseLeave={tip.hide}
      style={{
        display: "flex", alignItems: "center", gap: 10, cursor: onClick ? "pointer" : "default",
        /* Sans surlignage de fond : sur une liste de barres colorées, un voile
           gris posé derrière la ligne survolée ternit la seule chose qu'on est
           venu comparer. La bulle est l'accusé de réception du survol. */
        padding: "7px 0",
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
      {tip.node}
    </div>
  );
}

/**
 * Le détail d'UNE catégorie — ses applications et ses sites — à la place de la
 * liste des catégories, le temps qu'on survole sa part dans l'anneau.
 *
 * Pourquoi REMPLACER la liste plutôt que s'ouvrir sous elle : c'est la même
 * question (« dans quoi ce temps est-il passé ? ») posée d'un cran plus bas.
 * Deux listes empilées obligeraient à chercher laquelle répond à quoi, et la
 * carte doublerait de hauteur au passage de la souris.
 *
 * Le nom de la catégorie n'est pas repris en tête : le centre de l'anneau
 * l'affiche déjà, avec son total, pendant tout le survol.
 *
 * Les parts sont relatives à la CATÉGORIE et non à la journée : la liste
 * décompose la part qu'on désigne, et « 12 % du temps actif » ne dirait pas si
 * c'est le gros du poste ou une miette.
 */
export function CategoryDrilldown({ cat, color, apps, rows = 6 }) {
  const inCat = useMemo(
    () => apps.filter(a => a.cat === cat).sort((a, b) => b.ms - a.ms),
    [apps, cat],
  );
  const total = inCat.reduce((n, a) => n + a.ms, 0);

  if (!inCat.length) {
    return (
      <span style={{ fontSize: 12, color: T.textSub, display: "block", padding: "8px 0" }}>
        Rien de détaillé dans cette catégorie.
      </span>
    );
  }

  /* Le nombre de lignes est imposé par l'appelant — celui de la liste qu'on
     remplace — pour que la carte garde sa hauteur au passage de la souris. Ce
     qui déborde n'est pas coupé mais CUMULÉ sur la dernière ligne : une liste
     tronquée en silence ne totaliserait plus la part qu'elle détaille. */
  const over = inCat.length > rows;
  const head = over ? inCat.slice(0, Math.max(1, rows - 1)) : inCat;
  const restMs = total - head.reduce((n, a) => n + a.ms, 0);
  const pct = (ms) => (total ? (ms / total) * 100 : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {head.map(a => (
        <BarRow key={a.id} color={color || a.color} label={a.label} ms={a.ms} pct={pct(a.ms)} />
      ))}
      {over && (
        <BarRow
          color={GREY.grey300}
          label={`${inCat.length - head.length} autre${inCat.length - head.length > 1 ? "s" : ""}`}
          ms={restMs}
          pct={pct(restMs)}
        />
      )}
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
export function CategoryRows({ buckets, limit, productivity, showShare = true, apps }) {
  const [all, setAll] = useState(false);
  const shown = all || !limit ? buckets : buckets.slice(0, limit);

  /* Ce qui a rempli chaque catégorie, pour la bulle de survol. Une catégorie
     est un TOTAL : « Divertissement · 1 h 10 » ne dit pas si c'est une série ou
     dix fois deux minutes de réseaux, et c'est pourtant la seule chose qu'on
     veuille savoir en s'arrêtant dessus. `apps` est optionnel — les appelants
     qui ne l'ont pas gardent une bulle sans détail plutôt qu'une erreur. */
  const byCat = useMemo(() => {
    const m = new Map();
    for (const a of apps || []) {
      const list = m.get(a.cat) || [];
      list.push({ label: a.label, ms: a.ms });
      m.set(a.cat, list);
    }
    for (const list of m.values()) list.sort((x, y) => y.ms - x.ms);
    return m;
  }, [apps]);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {shown.map(b => (
        <BarRow
          key={b.id}
          color={b.color}
          label={b.label}
          ms={b.ms}
          pct={b.pct}
          details={(byCat.get(b.id) || []).slice(0, 6)}
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

/* ─── Choisir une couleur ────────────────────────────────────────────────── */

/**
 * Le nuancier des catégories : les teintes PUBLIÉES de la charte, et elles
 * seules (cf. lib/ui/palette). Pas de sélecteur libre — une couleur choisie au
 * hasard sort de la charte, et deux catégories voisines finissent
 * indiscernables dans un anneau de 136 px.
 */
export const CATEGORY_SWATCHES = [
  ...Object.values(PALETTE),
  ...Object.values(PALETTE_DARK),
  ...Object.values(PALETTE_LIGHT),
  HUE.moonJelly, HUE.beluga, HUE.seaSponge, HUE.anchovy,
];

/**
 * Pastille de couleur cliquable, ouvrant le nuancier.
 *
 * `size` est la taille de la PASTILLE, pas celle de la cible : le bouton garde
 * 24 px de côté quoi qu'il arrive. Une pastille de couleur est un repère (elle
 * doit peser autant que les autres puces de la liste, soit une dizaine de
 * pixels), pas un bouton — mais elle doit rester cliquable au premier essai.
 */
export function ColorPicker({ value, onPick, label = "Couleur", size = 14 }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={label}
        title={label}
        style={{
          width: 24, height: 24, borderRadius: "50%", border: "none", flexShrink: 0,
          background: "transparent", cursor: "pointer", padding: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ width: size, height: size, borderRadius: "50%", background: value }} />
      </button>
      <Popover
        anchorRef={ref}
        open={open}
        onClose={() => setOpen(false)}
        gap={6}
        minWidth={196}
        className="anim-pop"
        style={{ background: T.white, borderRadius: 12, boxShadow: "var(--elev-overlay)", border: `1px solid ${T.border}`, padding: 10 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 7 }}>
          {CATEGORY_SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { onPick?.(c); setOpen(false); }}
              aria-label={c}
              style={{
                width: 16, height: 16, borderRadius: "50%", border: "none", padding: 0,
                background: c, cursor: "pointer",
                boxShadow: c === value ? `0 0 0 2px ${T.text}` : "none",
              }}
            />
          ))}
        </div>
      </Popover>
    </>
  );
}

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
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
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
          {assignableCategories().map(c => {
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
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
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
 * Le sélecteur de catégorie d'une ligne — ou, quand la ligne ne peut pas être
 * rangée d'un clic, ce qui le DIT.
 *
 * Le cas existe et n'était pas traité : une page de navigateur dont le titre ne
 * livre aucun nom de site n'a rien sur quoi poser une règle sûre (le seul texte
 * disponible est « Arc », et une règle dessus classerait TOUTE la navigation).
 * Le clic était alors ignoré en silence — on choisissait une catégorie et rien
 * ne bougeait, sans un mot d'explication.
 *
 * `blocked(app)` rend la raison, ou `null`. Quand il y a une raison, le clic
 * appelle `onPick(app, null)` : à l'appelant d'emmener là où le cas se règle.
 */
function PickCell({ app, onPick, blocked }) {
  const why = blocked ? blocked(app) : null;
  if (!why) return <CategoryPicker cat={app.cat} onPick={(c) => onPick(app, c)} />;
  return (
    <button
      type="button"
      onClick={() => onPick(app, null)}
      title={why}
      style={{
        ...BTN.sm, border: `1px solid ${HAIRLINE}`, background: "transparent",
        color: T.textSub, fontFamily: "inherit", fontSize: 12, cursor: "pointer",
        whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      À régler…
    </button>
  );
}

/**
 * Répartition par application / site. `onPick` rend chaque ligne corrigeable.
 *
 * La liste reçoit des données DÉJÀ nettoyées : le seuil des cinq minutes est
 * posé une fois pour toute la section (cf. `ranked` dans lib/activity/stats).
 * Le porter aussi ici en ferait deux règles à tenir d'accord, et c'est toujours
 * la seconde qu'on oublie de changer.
 */
export function AppRows({ apps, limit = 8, onPick = null, blocked = null, empty = null }) {
  const [all, setAll] = useState(false);
  const tip = useChartTip();

  const shown = all ? apps : apps.slice(0, limit);
  if (!apps.length) {
    return <span style={{ fontSize: 12, color: T.textSub, padding: "8px 0" }}>{empty ?? "Rien à afficher."}</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {shown.map(a => {
        /* La ligne ne montre que le PREMIER titre de fenêtre, tronqué. Le survol
           est le seul endroit où l'on peut voir dans quoi l'heure passée sur
           l'application s'est réellement découpée. */
        const content = (
          <>
            <TipTitle>{a.label}</TipTitle>
            {/* Durée et part sur la MÊME ligne : ce sont deux façons de dire la
                même quantité, et les séparer obligeait à descendre d'un cran
                pour lire la seconde moitié de la réponse. */}
            <TipLine color={a.color} label={categoryLabel(a.cat)} value={`${fmtDur(a.ms)}${pctLabel(a.pct) ? ` · ${pctLabel(a.pct)}` : ""}`} strong />
            {(a.titles || []).slice(0, 5).map(t => (
              <TipLine key={t.title} label={t.title} value={fmtDur(t.ms, { short: true })} />
            ))}
            {(a.titles || []).length > 5 && (
              <TipLine label={`+ ${a.titles.length - 5} autre${a.titles.length - 5 > 1 ? "s" : ""}`} value="" />
            )}
          </>
        );
        const hover = (e) => tip.show(e, a.id, content);
        return (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <div
            data-chart-part
            onMouseEnter={hover}
            onMouseMove={hover}
            onClick={(e) => tip.pin(e, a.id, content)}
            /* Fermeture au bord de la ZONE DE LECTURE, pas de la ligne : sinon
               la bulle survit au passage vers le sélecteur de catégorie à
               droite et vient flotter par-dessus son menu. */
            onMouseLeave={tip.hide}
            style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5, cursor: "pointer" }}
          >
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
            {/* Plus de titre de fenêtre sous la barre : il n'en tenait qu'UN,
                tronqué, choisi pour sa durée — donc souvent le moins parlant des
                cinq. La bulle de survol les donne tous, en entier ; le laisser
                ici doublait la hauteur de chaque ligne pour en dire moins. */}
          </div>
          {/* La catégorie n'est répétée à droite que là où elle se CHANGE. En
              lecture seule elle ne servait à rien : la couleur de la barre la
              dit déjà, l'anneau juste au-dessus la dit en grand, et la bulle la
              nomme au survol. */}
          {onPick && <PickCell app={a} onPick={onPick} blocked={blocked} />}
        </div>
        );
      })}
      {tip.node}
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

/**
 * « N entrées sous cinq minutes, non listées ».
 *
 * Ce qui a été retiré est DIT, en une ligne. Sans elle, les parts ne totalisent
 * plus cent pour cent sans qu'on sache pourquoi, et la différence passe pour une
 * erreur de mesure — c'est-à-dire pour un bug de la page.
 */
export function CrumbNote({ count }) {
  if (!count) return null;
  return (
    <span style={{ fontSize: 11, color: T.textMut }}>
      {count} sous {fmtDur(SHOWN_MIN_MS)}, non listée{count > 1 ? "s" : ""}.
    </span>
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
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: categoryColor(s.cat), flexShrink: 0 }} />
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
/**
 * `onHover` — prévenu de la part désignée (`null` en sortant). Symétrique de
 * celui de l'anneau : c'est par là qu'une barre commande la liste qui la
 * détaille, au lieu de garder pour elle ce que la souris montre.
 */
export function StackedBar({ parts, height = 12, minPct = 1.2, onHover, tip: extTip }) {
  const shown = parts.filter(p => p.pct > 0);
  const total = shown.reduce((n, p) => n + p.pct, 0) || 1;
  /* Un appelant qui pilote une LISTE avec cette barre lui passe son propre
     contrôleur : survol, épinglage et bulle vivent alors dans un seul état, et
     la liste ne peut pas dire autre chose que la figure. */
  const own = useChartTip();
  const tip = extTip || own;
  return (
    <div
      style={{ display: "flex", gap: 2, height, width: "100%", borderRadius: 999, overflow: "hidden", background: FIELD_BG }}
      onMouseLeave={() => { tip.hide(); onHover?.(null); }}
    >
      {shown.map(p => {
        /* Ici les parts sont côte à côte et de même hauteur : un surlignage ne
           les distinguerait pas. C'est l'inverse qui marche — les VOISINES
           reculent, la désignée reste à pleine encre. */
        const dim = tip.key != null && tip.key !== p.id;
        const content = (
          <>
            <TipTitle>{p.label}</TipTitle>
            <TipLine color={p.color} label="Durée" value={`${fmtDur(p.ms)} · ${Math.round(p.pct * 10) / 10} %`} strong />
          </>
        );
        const hover = (e) => { tip.show(e, p.id, content); onHover?.(p.id); };
        return (
          <div
            key={p.id}
            data-chart-part
            onMouseEnter={hover}
            onMouseMove={hover}
            onClick={(e) => tip.pin(e, p.id, content)}
            aria-label={`${p.label} — ${fmtDur(p.ms)}`}
            style={{
              cursor: "pointer",
              // Une part d'une minute doit rester visible : sans plancher, elle
              // disparaît et la barre ment par omission.
              width: `${Math.max(minPct, (p.pct / total) * 100)}%`,
              background: p.color, minWidth: 3,
              opacity: dim ? 0.4 : 1,
              transition: "opacity .12s ease",
            }}
          />
        );
      })}
      {tip.node}
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
