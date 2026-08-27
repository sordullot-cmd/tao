"use client";

/* ============================================================================
   « Activité → Catégories & règles ».

   C'est la page qui rend le suivi CRÉDIBLE : un classement automatique se trompe
   forcément (une même app sert à travailler et à perdre son temps), et une
   mesure qu'on ne peut pas corriger finit ignorée.

   L'ordre suit la FRÉQUENCE, pas la logique du réglage. La page alignait six
   cartes de même poids, en commençant par le capteur et les neuf seuils de
   mesure — deux blocs qu'on touche une fois par installation — et finissait par
   la file des applications non classées, la seule chose qu'on vienne y faire
   régulièrement. C'est maintenant :

     1. la file des applications non classées — l'action du quotidien ; tant
        qu'elle n'est pas vide, tout le reste de la section est faussé ;
     2. la nature des catégories (productif / neutre / distraction), que
        l'utilisateur seul peut trancher ;
     3. puis, en tiroirs fermés : ses règles (écrites pour lui depuis la file),
        les réglages de la mesure, l'état du capteur, et ses données.
   ========================================================================== */

import React, { useMemo, useState } from "react";
import { Check, Play, Plus, Trash2 } from "lucide-react";
import {
  CARD, FIELD_BG, HAIRLINE, Field, FieldGrid, Input, PillButton, Select, IconButton,
} from "@/components/ui/da";
import { T } from "@/lib/ui/tokens";
import { BTN } from "@/lib/ui/buttons";
import { PALETTE } from "@/lib/ui/palette";
import { dotRing } from "@/lib/ui/color";
import { getLocalDateString } from "@/lib/dateUtils";
import {
  ASSIGNABLE, CATEGORIES, CATEGORY_BY_ID, catalogSize, categoryLabel, isBrowser,
  PRODUCTIVITY_COLOR, resolveProductivity, suggestCategory,
} from "@/lib/activity/categories";
import { clearAll, listDays, loadRange } from "@/lib/activity/engine";
import { fmtDur, recategorize, unclassified } from "@/lib/activity/stats";
import { hasNativeTracking, snapshot } from "@/lib/activity/native";
import { useActivityLive, useActivitySettings } from "@/lib/hooks/useActivityTracker";
import {
  ActivityHeader, BlockTitle, CategoryPicker, Disclosure, SourceNotice, Toggle,
} from "@/components/activity/ActivityChrome";

const NATURE_OPTIONS = [
  { id: "productive", label: "Productif", color: PRODUCTIVITY_COLOR.productive },
  { id: "neutral", label: "Neutre", color: PRODUCTIVITY_COLOR.neutral },
  { id: "distracting", label: "Distraction", color: PRODUCTIVITY_COLOR.distracting },
];

/** Champ numérique d'un réglage, borné — un seuil négatif n'a pas de sens. */
function NumberField({ label, hint, value, onChange, min = 0, max = 999, suffix }) {
  return (
    <Field label={label} hint={hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            onChange(Math.max(min, Math.min(max, n)));
          }}
          style={{ maxWidth: 110 }}
        />
        {suffix && <span style={{ fontSize: 12, color: T.textSub, whiteSpace: "nowrap" }}>{suffix}</span>}
      </div>
    </Field>
  );
}

/**
 * Classer une page de navigateur dont le titre ne donne aucun nom de site.
 *
 * Ces lignes-là étaient un cul-de-sac : l'interface disait « écris une règle
 * sur un mot de ce titre » et n'offrait aucun endroit pour le faire, alors que
 * la file d'attente promet juste au-dessus qu'une catégorie suffit.
 *
 * Le champ part du titre relevé, à l'utilisateur de le RÉDUIRE au mot qui
 * reviendra — « anime-sama » plutôt que « Épisode 12 | Anime-Sama ». On ne le
 * réduit pas à sa place : le mot distinctif dépend de ce qu'il y a autour, et
 * un mauvais découpage écrirait une règle qui classe de travers sans le dire.
 *
 * Un titre vide n'est pas un choix mais une PANNE (autorisation d'accessibilité
 * refusée sur macOS, cf. lib/activity/native) : on le dit plutôt que de
 * proposer un champ qui ne peut rien produire.
 */
function TitleRuleRow({ title, onAdd }) {
  const [frag, setFrag] = useState("");
  const value = frag || title;

  if (!title) {
    return (
      <span style={{ fontSize: 11, color: T.textSub, maxWidth: 260 }}>
        Titre de fenêtre illisible : sans lui, rien ne distingue cette page du
        navigateur. Autorise « Accessibilité » pour l’app de bureau.
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Input
        compact
        value={value}
        onChange={(e) => setFrag(e.target.value)}
        aria-label="Mot à reconnaître dans le titre"
        placeholder="mot du titre"
        style={{ width: 200 }}
      />
      <CategoryPicker
        cat="other"
        label="Classer dans…"
        onPick={(cat) => { const v = value.trim(); if (v) onAdd(v, cat); }}
      />
    </div>
  );
}

export default function ActivityRulesPage({ setPage }) {
  const [settings, setSettings] = useActivitySettings();
  const live = useActivityLive();
  const [probe, setProbe] = useState(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [draft, setDraft] = useState({ match: "", field: "app", category: "dev" });
  const [version, setVersion] = useState(0);

  const patch = (fn) => setSettings(s => fn({ ...s }));

  const today = getLocalDateString();
  /* `version` n'est lu par aucun de ces mémos : il n'existe que pour les
     rouvrir après une mutation du stockage (effacement de l'historique), qui
     n'est pas réactive. */
  const days = useMemo(() => { void version; return listDays(); }, [version]);

  /* Fenêtre de 30 jours : assez pour que les applications occasionnelles
     remontent dans la file « non classées », assez court pour que le classement
     porte sur des usages actuels. */
  const logs = useMemo(() => {
    void version;
    const from = new Date(`${today}T00:00:00`);
    from.setDate(from.getDate() - 29);
    return loadRange(getLocalDateString(from), today);
  }, [today, version]);

  const pending = useMemo(() => unclassified(logs, settings), [logs, settings]);

  /* Reclassé avec les règles COURANTES : sinon la colonne des durées contredit
     la file d'attente juste en dessous, qui, elle, est à jour. */
  const categoryTotals = useMemo(() => {
    const map = new Map();
    for (const log of logs) {
      for (const seg of recategorize(log, settings)) {
        map.set(seg.cat, (map.get(seg.cat) || 0) + Math.max(0, seg.e - seg.s));
      }
    }
    return map;
  }, [logs, settings]);

  const catalog = useMemo(() => catalogSize(), []);

  const segmentCount = useMemo(() => logs.reduce((n, l) => n + l.segments.length, 0), [logs]);

  const addRule = (match, field, category) => {
    const clean = (match || "").trim().toLowerCase();
    if (!clean) return;
    patch(s => ({
      ...s,
      rules: [...s.rules, { id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, match: clean, field, category }],
    }));
  };

  const exportCsv = () => {
    const rows = [["date", "debut", "fin", "minutes", "application", "affichage", "categorie", "titre"]];
    for (const log of loadRange(days[0] || today, today)) {
      for (const seg of log.segments) {
        rows.push([
          log.date,
          new Date(seg.s).toISOString(),
          new Date(seg.e).toISOString(),
          ((seg.e - seg.s) / 60000).toFixed(2),
          seg.app,
          seg.label,
          seg.cat,
          (seg.title || "").replace(/[";\n]/g, " "),
        ]);
      }
    }
    const csv = rows.map(r => r.map(c => `"${String(c)}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tr4de-activite-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ActivityHeader page="activity-rules" setPage={setPage} live={live} />

      <SourceNotice live={live} />

      {/* ── File d'attente ──
          La file décide de la crédibilité du suivi : ce qui reste ici ne compte
          ni comme travail ni comme distraction, et fausse donc TOUTES les autres
          mesures. Elle doit se vider en un clic par ligne, pas en réfléchissant
          à un fragment de texte et à un champ. */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
        <BlockTitle right={`${pending.length} à classer`}>Applications non classées</BlockTitle>
        {pending.length === 0 ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textSub }}>
            <Check size={14} color={PALETTE.green} /> Tout ce qui a été mesuré ces 30 jours est classé.
          </span>
        ) : (
          <>
            <span style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
              Choisis une catégorie : la règle est écrite pour toi, sur le bon champ (le titre pour un
              site, le nom pour une application), et les 30 derniers jours se reclassent aussitôt.
              Elle rejoint « Mes règles de classement », plus bas, où elle se corrige ou se supprime.
            </span>
            {pending.slice(0, 25).map(a => {
              /* Un site vu dans un navigateur ne se reconnaît qu'à son titre :
                 une règle sur « chrome » classerait TOUT le navigateur. */
              const viaTitle = a.isSite;
              const target = viaTitle ? a.label : (a.app || a.label);
              const risky = viaTitle && isBrowser(a.label);
              const suggestion = suggestCategory(a.app, a.titles[0]?.title || "");
              return (
                <div key={a.label} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 0",
                  borderBottom: `1px solid ${HAIRLINE}`, flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, color: T.text }}>{a.label}</span>
                    {/* Le nom brut n'est répété que s'il apprend quelque chose :
                        « BidulePro » sous « BidulePro » ne dit rien. */}
                    {(a.titles[0]?.title || (viaTitle ? "page sans titre" : a.app)) !== a.label && (
                      <span style={{ fontSize: 11, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 460 }}>
                        {a.titles[0]?.title || (viaTitle ? "page sans titre" : a.app)}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>{fmtDur(a.ms)}</span>
                  {suggestion && !risky && (
                    <button
                      type="button"
                      onClick={() => addRule(target, viaTitle ? "title" : "app", suggestion)}
                      title={`Créer la règle « ${target} » → ${categoryLabel(suggestion)}`}
                      style={{
                        ...BTN.sm, border: "none", fontFamily: "inherit", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", gap: 6,
                        background: FIELD_BG, color: T.text,
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: CATEGORY_BY_ID[suggestion]?.color, flexShrink: 0 }} />
                      {categoryLabel(suggestion)} ?
                    </button>
                  )}
                  {risky ? (
                    /* Page dont le titre ne livre aucun nom de site : la règle
                       ne peut porter que sur un MOT de ce titre, et lequel est
                       un choix humain — « Arc » classerait toute la navigation.
                       La ligne pose donc la question au lieu de renvoyer
                       l'utilisateur écrire la règle ailleurs à la main. */
                    <TitleRuleRow title={a.titles[0]?.title || ""} onAdd={(frag, cat) => addRule(frag, "title", cat)} />
                  ) : (
                    <CategoryPicker
                      cat="other"
                      label="Classer dans…"
                      onPick={(cat) => addRule(target, viaTitle ? "title" : "app", cat)}
                    />
                  )}
                </div>
              );
            })}
            {pending.length > 25 && (
              <span style={{ fontSize: 11, color: T.textSub }}>
                {pending.length - 25} autres, plus courtes, ne sont pas listées : elles remonteront si tu y passes du temps.
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Catégories ── */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 12 }}>
        <BlockTitle right="30 derniers jours">Catégories</BlockTitle>
        <span style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
          La nature d’une catégorie décide de ce qui compte comme focus et comme distraction.
          « Réunions » est du travail pour l’un, du temps subi pour l’autre : c’est à toi de trancher.
          {" "}L’app reconnaît {catalog.total} applications et sites d’elle-même ; tes règles passent avant.
        </span>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {CATEGORIES.map(c => {
            const nature = resolveProductivity(c.id, settings.productivity);
            const ms = categoryTotals.get(c.id) || 0;
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                borderBottom: `1px solid ${HAIRLINE}`, flexWrap: "wrap",
              }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, boxShadow: dotRing(c.color), flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13, color: T.text }}>{categoryLabel(c.id)}</span>
                  <span style={{ fontSize: 11, color: T.textSub }}>
                    {c.hint}{catalog.byCategory[c.id] ? ` · ${catalog.byCategory[c.id]} connues` : ""}
                  </span>
                </span>
                <span style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "right" }}>
                  {ms > 0 ? fmtDur(ms) : "—"}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {NATURE_OPTIONS.map(o => {
                    const on = nature === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => patch(s => ({ ...s, productivity: { ...s.productivity, [c.id]: o.id } }))}
                        style={{
                          ...BTN.sm,
                          border: "none", fontFamily: "inherit", cursor: "pointer",
                          background: on ? `color-mix(in srgb, ${o.color} 18%, transparent)` : FIELD_BG,
                          color: on ? T.text : T.textSub,
                          boxShadow: on ? dotRing(o.color) : "none",
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Règles ── */}
      <Disclosure
        title="Mes règles de classement"
        right={settings.rules.length ? `${settings.rules.length} règle${settings.rules.length > 1 ? "s" : ""}` : "aucune"}
      >
        <span style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
          Une règle cherche un fragment de texte dans le nom de l’application ou dans le titre de
          la fenêtre. Tes règles passent avant celles livrées avec l’app, et la plus récente
          l’emporte — corriger une erreur ne demande donc pas de supprimer l’ancienne.
        </span>

        {settings.rules.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Input
              compact
              value={r.match}
              onChange={(e) => patch(s => ({ ...s, rules: s.rules.map(x => x.id === r.id ? { ...x, match: e.target.value.toLowerCase() } : x) }))}
              style={{ flex: 1, minWidth: 160 }}
            />
            <Select
              value={r.field || "app"}
              onChange={(e) => patch(s => ({ ...s, rules: s.rules.map(x => x.id === r.id ? { ...x, field: e.target.value } : x) }))}
              style={{ width: 150 }}
            >
              <option value="app">dans l’application</option>
              <option value="title">dans le titre</option>
            </Select>
            <Select
              value={r.category}
              onChange={(e) => patch(s => ({ ...s, rules: s.rules.map(x => x.id === r.id ? { ...x, category: e.target.value } : x) }))}
              style={{ width: 190 }}
            >
              {ASSIGNABLE.map(c => <option key={c.id} value={c.id}>{categoryLabel(c.id)}</option>)}
            </Select>
            <IconButton
              tone="danger"
              aria-label="Supprimer la règle"
              onClick={() => patch(s => ({ ...s, rules: s.rules.filter(x => x.id !== r.id) }))}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: settings.rules.length ? 8 : 0, borderTop: settings.rules.length ? `1px solid ${HAIRLINE}` : "none" }}>
          <Input
            compact
            placeholder="Fragment cherché (ex. « figma », « youtube »)"
            value={draft.match}
            onChange={(e) => setDraft(d => ({ ...d, match: e.target.value }))}
            style={{ flex: 1, minWidth: 180 }}
          />
          <Select value={draft.field} onChange={(e) => setDraft(d => ({ ...d, field: e.target.value }))} style={{ width: 150 }}>
            <option value="app">dans l’application</option>
            <option value="title">dans le titre</option>
          </Select>
          <Select value={draft.category} onChange={(e) => setDraft(d => ({ ...d, category: e.target.value }))} style={{ width: 190 }}>
            {ASSIGNABLE.map(c => <option key={c.id} value={c.id}>{categoryLabel(c.id)}</option>)}
          </Select>
          <PillButton
            compact
            variant="primary"
            disabled={!draft.match.trim()}
            onClick={() => { addRule(draft.match, draft.field, draft.category); setDraft({ match: "", field: "app", category: draft.category }); }}
          >
            <Plus size={13} /> Ajouter
          </PillButton>
        </div>
      </Disclosure>

      {/* ── Ce qu'on règle une fois ──
          Trois tiroirs, fermés. Ces blocs occupaient les deux tiers de la page
          alors qu'on y touche une fois par installation : le capteur ne se
          regarde que lorsqu'il ne marche plus (et il le dit lui-même, en haut de
          page), les seuils une fois pour toutes, l'export encore moins souvent.
          Ce qui se fait SOUVENT — ranger une application, corriger une règle —
          passe donc devant. */}
      {/* ── Réglages ── */}
      <Disclosure title="Réglages de la mesure et des rappels" right={`relevé ${settings.pollSeconds} s · objectif ${settings.workGoalHours} h`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Toggle
            label="Suivi actif"
            checked={settings.enabled}
            onChange={(v) => patch(s => ({ ...s, enabled: v }))}
            hint="Arrêté, plus rien n'est mesuré — l'historique déjà enregistré reste intact."
          />
          <Toggle
            label="Notifications système"
            checked={settings.notifications}
            onChange={(v) => patch(s => ({ ...s, notifications: v }))}
            hint="Rappel de pause, journée trop longue, dérive prolongée."
          />
        </div>
        <FieldGrid columns={3}>
          <NumberField
            label="Fréquence de relevé"
            hint="Plus court = plus précis, un peu plus de travail pour la machine."
            value={settings.pollSeconds} min={2} max={60} suffix="s"
            onChange={(v) => patch(s => ({ ...s, pollSeconds: v }))}
          />
          <NumberField
            label="Seuil d'inactivité"
            hint="Sans clavier ni souris au-delà, le temps n'est plus compté."
            value={Math.round(settings.afkSeconds / 60)} min={1} max={60} suffix="min"
            onChange={(v) => patch(s => ({ ...s, afkSeconds: v * 60 }))}
          />
          <NumberField
            label="Session de focus minimale"
            hint="En dessous, la plage ne compte pas comme une session."
            value={settings.focusMinMinutes} min={5} max={120} suffix="min"
            onChange={(v) => patch(s => ({ ...s, focusMinMinutes: v }))}
          />
          <NumberField
            label="Interruption tolérée"
            hint="Une coupure plus courte ne casse pas la session en cours."
            value={settings.focusGapMinutes} min={0} max={15} suffix="min"
            onChange={(v) => patch(s => ({ ...s, focusGapMinutes: v }))}
          />
          <NumberField
            label="Objectif de temps actif"
            value={settings.workGoalHours} min={1} max={16} suffix="h / jour"
            onChange={(v) => patch(s => ({ ...s, workGoalHours: v }))}
          />
          <NumberField
            label="Objectif de focus"
            value={settings.focusGoalHours} min={1} max={12} suffix="h / jour"
            onChange={(v) => patch(s => ({ ...s, focusGoalHours: v }))}
          />
          <NumberField
            label="Rappel de pause"
            hint="0 = jamais."
            value={settings.breakEveryMinutes} min={0} max={240} suffix="min d'affilée"
            onChange={(v) => patch(s => ({ ...s, breakEveryMinutes: v }))}
          />
          <NumberField
            label="Alerte journée longue"
            hint="0 = jamais."
            value={settings.overworkHours} min={0} max={20} suffix="h actives"
            onChange={(v) => patch(s => ({ ...s, overworkHours: v }))}
          />
          <NumberField
            label="Alerte dérive"
            hint="Temps continu sur une catégorie « distraction ». 0 = jamais."
            value={settings.distractionAlertMinutes} min={0} max={120} suffix="min"
            onChange={(v) => patch(s => ({ ...s, distractionAlertMinutes: v }))}
          />
        </FieldGrid>
      </Disclosure>

      {/* ── Le capteur ── */}
      <Disclosure title="Le capteur" right={`${hasNativeTracking() ? "app de bureau" : "navigateur"} · ${!live.running ? "arrêté" : live.away ? "absent" : "en cours"}`}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {[
            { k: "Portée", v: hasNativeTracking() ? "Tout le poste" : "Cet onglet seulement" },
            { k: "Plateforme", v: live.platform || "—" },
            { k: "Application vue", v: live.app || "—" },
            { k: "Fenêtre", v: live.title || "—" },
            { k: "Inactivité", v: `${live.idleSeconds || 0} s` },
            { k: "État", v: !live.running ? "arrêté" : live.away ? "absent" : "en cours" },
          ].map(r => (
            <div key={r.k} style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 11, color: T.textSub }}>{r.k}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <PillButton
            compact
            onClick={async () => setProbe(await snapshot())}
          >
            <Play size={13} /> Tester le capteur
          </PillButton>
          {probe && (
            <span style={{ fontSize: 12, color: probe.ok ? T.text : T.red }}>
              {probe.ok
                ? `${probe.app || "—"}${probe.title ? ` · ${probe.title}` : ""} · inactif ${probe.idleSeconds} s`
                : `Échec : ${probe.error || "cause inconnue"}`}
            </span>
          )}
        </div>
      </Disclosure>

      {/* ── Données ── */}
      <Disclosure title="Mes données" right={`${days.length} jour${days.length > 1 ? "s" : ""} enregistré${days.length > 1 ? "s" : ""}`}>
        <span style={{ fontSize: 12, color: T.textSub, lineHeight: 1.5 }}>
          Les mesures restent sur CE poste (stockage local du navigateur / de l’app), et ne
          partent sur aucun serveur : une activité est celle d’une machine, la mélanger avec
          celle d’une autre fausserait les totaux. Seuls les réglages et les règles ci-dessus
          sont synchronisés avec ton compte. Les journées de plus de 120 jours sont effacées
          automatiquement. {segmentCount > 0 && `${segmentCount} segments sur les 30 derniers jours.`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <PillButton compact onClick={exportCsv} disabled={days.length === 0}>Exporter en CSV</PillButton>
          {confirmWipe ? (
            <>
              <PillButton
                compact
                variant="danger"
                onClick={() => { clearAll(); setConfirmWipe(false); setVersion(v => v + 1); }}
              >
                Confirmer l’effacement
              </PillButton>
              <PillButton compact variant="ghost" onClick={() => setConfirmWipe(false)}>Annuler</PillButton>
            </>
          ) : (
            <PillButton compact variant="danger" onClick={() => setConfirmWipe(true)} disabled={days.length === 0}>
              <Trash2 size={13} /> Effacer l’historique
            </PillButton>
          )}
        </div>
      </Disclosure>
    </div>
  );
}
