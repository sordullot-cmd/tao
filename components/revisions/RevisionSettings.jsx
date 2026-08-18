"use client";

/**
 * Réglages des révisions.
 *
 * Deux niveaux, séparés à l'écran : ce qui se règle au jugé (combien de cartes
 * par jour, quelle rétention viser) et ce qui se CALCULE (les 21 poids du
 * modèle). Les mélanger inviterait à bricoler des poids à la main, ce qui ne
 * peut que dégrader la planification — ils ne veulent rien dire pris un par un.
 */

import React, { useMemo, useRef, useState } from "react";
import {
  Sparkles, Download, Upload, RotateCcw, Loader2, AlertTriangle, Check,
} from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
/* Les briques de formulaire sont importées de `components/ui/form` et les
   aplats de `lib/ui/tokens`, plutôt que de passer par `components/ui/da` qui
   les réexporte : ce chemin-là est valide dans tous les cas, alors que le bloc
   de réexport de `da.jsx` a déjà disparu une fois. Les briques de MISE EN PAGE
   (carte, titre de section, fil d'Ariane) viennent bien de `da`, elles y sont
   définies. */
import { CARD, SectionTitle } from "@/components/ui/da";
import { Field, FieldGrid, Input, PillButton, Select } from "@/components/ui/form";
import { DEFAULT_PARAMETERS, defaultConfig } from "@/lib/srs/fsrs";
import {
  MINIMUM_REVIEWS, RECOMMENDED_REVIEWS, isDefaultParameters, optimizeParameters,
  parseParameters, usableReviewCount,
} from "@/lib/srs/optimizer";
import { fromJsonBackup, toAnkiText, toJsonBackup } from "@/lib/srs/ankiText";

/* Toute la prose de l'écran, groupée. Les réglages d'un algorithme ne se
   comprennent pas sans qu'on dise ce qu'ils COÛTENT — d'où ce volume de texte,
   qui n'a pas sa place dispersé dans l'arbre de rendu. */
const COPY = {
  algorithm:
    "FSRS-6 décrit votre mémoire par 21 poids. Ceux d'origine décrivent une mémoire moyenne ; "
    + "l'optimisation cherche ceux qui auraient le mieux prédit VOS réponses passées.",
  tooFewReviews: (n) =>
    `Il faut au moins ${n} révisions espacées de plus d'un jour pour ajuster 21 poids — en `
    + "dessous, on ajusterait du bruit. Continuez à réviser : le compteur monte tout seul.",
  smallSample: (n) =>
    "L'optimisation est possible, mais le résultat reste indicatif tant qu'on n'a pas dépassé "
    + `${n} révisions.`,
  resetWeights: "Revenir aux poids d'origine",
  noImprovement:
    "Aucun jeu de poids n'a fait mieux que celui en place : il est déjà bien ajusté à votre "
    + "historique. Les poids actuels sont conservés.",
  unreliable: "Échantillon encore petit : relancez l'optimisation dans quelques semaines.",
  pasteWeights: "Reprendre des poids venus d'Anki",
  whereInAnki:
    "Dans Anki : Options du paquet → FSRS → champ « Paramètres ». Les valeurs hors bornes "
    + "sont ramenées au domaine admissible.",
  dataFormats:
    "Le format texte s'ouvre dans Anki mais ne transporte que les notes. La sauvegarde "
    + "complète emporte aussi l'historique et les poids — c'est elle qu'il faut pour changer "
    + "d'appareil sans rien perdre.",
  restoreWarning:
    "Restaurer REMPLACE tout : paquets, cartes, historique et réglages. Exportez avant si le "
    + "contenu actuel compte.",
  resetAll: "Rétablir tous les réglages d'origine",
  retentionHigh:
    "Au-delà de 95 %, chaque point gagné coûte beaucoup de révisions supplémentaires pour très "
    + "peu de mémoire en plus. C'est le réglage des concours, pas de l'entretien.",
  retentionLow:
    "En dessous de 85 %, vous oubliez souvent, et réapprendre coûte plus cher que d'entretenir. "
    + "À réserver à un très gros volume qu'on accepte de connaître imparfaitement.",
  retentionBalanced:
    "90 % est le réglage de référence : c'est le meilleur rapport entre le travail fourni et ce "
    + "qui reste en mémoire.",
};

/** Déclenche un téléchargement depuis une chaîne, sans passer par le serveur. */
function download(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Liste de durées saisie en clair (« 1 10 » ou « 1, 10 »), en minutes. */
function parseSteps(raw) {
  return raw.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
}

export default function RevisionSettings({ store, setStore, onRestore }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState(null);
  const [paramInput, setParamInput] = useState("");
  const [paramError, setParamError] = useState(null);
  const [notice, setNotice] = useState(null);
  const stopRef = useRef(false);

  const usable = useMemo(() => usableReviewCount(store.log), [store.log]);
  const config = store.config;

  const setConfig = (patch) => setStore(prev => ({ ...prev, config: { ...prev.config, ...patch } }));

  const runOptimizer = async () => {
    setRunning(true);
    setProgress(0);
    setOutcome(null);
    stopRef.current = false;
    const result = await optimizeParameters(store, {
      onProgress: (fraction) => setProgress(fraction),
      shouldStop: () => stopRef.current,
    });
    setRunning(false);
    setOutcome(result);
    if (result.status !== "insufficient" && result.parameters) {
      setConfig({ parameters: result.parameters });
    }
  };

  const applyPastedParameters = () => {
    const parsed = parseParameters(paramInput);
    if (!parsed) {
      setParamError("Il faut exactement 21 nombres, séparés par des virgules ou des espaces.");
      return;
    }
    setParamError(null);
    setConfig({ parameters: parsed });
    setParamInput("");
    setNotice("Poids repris.");
  };

  const onRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const restored = fromJsonBackup(String(reader.result || ""));
      if (!restored) { setNotice("Ce fichier n'est pas une sauvegarde des révisions."); return; }
      onRestore(restored);
      setNotice("Sauvegarde restaurée.");
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const retentionPct = Math.round(config.desiredRetention * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionTitle>Réglages</SectionTitle>

      {/* ── Rythme ───────────────────────────────────────────────────────── */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Rythme</div>

        <Field
          label={`Rétention visée — ${retentionPct} %`}
          hint="La probabilité de vous souvenir au moment où une carte revient. Monter ce chiffre raccourcit tous les intervalles, donc alourdit la charge quotidienne."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="range"
              min={70}
              max={97}
              value={retentionPct}
              onChange={e => setConfig({ desiredRetention: Number(e.target.value) / 100 })}
              style={{ flex: 1, accentColor: T.brand }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text, width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {retentionPct} %
            </span>
          </div>
        </Field>

        {/* Le coût d'une rétention haute n'est pas intuitif : il explose au-delà
            de 90 %, et l'écrire évite de régler à 97 % « pour bien faire ». */}
        <div style={{ background: FIELD_BG, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
          {retentionPct >= 95
            ? COPY.retentionHigh
            : retentionPct <= 80 ? COPY.retentionLow : COPY.retentionBalanced}
        </div>

        <FieldGrid columns={2}>
          <Field label="Nouvelles cartes par jour" hint="Chacune engendrera environ 10 révisions à venir.">
            <Input
              type="number"
              min={0}
              value={store.newPerDay}
              onChange={e => setStore(p => ({ ...p, newPerDay: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </Field>
          <Field label="Révisions par jour" hint="Un plafond de secours. Le dépasser régulièrement signale trop de nouvelles cartes en amont.">
            <Input
              type="number"
              min={0}
              value={store.reviewsPerDay}
              onChange={e => setStore(p => ({ ...p, reviewsPerDay: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </Field>
        </FieldGrid>

        <FieldGrid columns={2}>
          <Field label="Paliers d'apprentissage" hint="En minutes, séparés par des espaces. Vide : la carte passe en révision dès la première réponse.">
            <Input
              defaultValue={config.learningSteps.join(" ")}
              onBlur={e => setConfig({ learningSteps: parseSteps(e.target.value) })}
              placeholder="1 10"
            />
          </Field>
          <Field label="Paliers de réapprentissage" hint="Après un oubli, avant de reprendre le cours normal.">
            <Input
              defaultValue={config.relearningSteps.join(" ")}
              onBlur={e => setConfig({ relearningSteps: parseSteps(e.target.value) })}
              placeholder="10"
            />
          </Field>
        </FieldGrid>

        <FieldGrid columns={3}>
          <Field label="Intervalle maximal" hint="En jours.">
            <Input
              type="number"
              min={1}
              value={config.maximumInterval}
              onChange={e => setConfig({ maximumInterval: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Field>
          <Field label="Début de journée" hint="Heure de bascule. Réviser avant compte pour la veille.">
            <Input
              type="number"
              min={0}
              max={23}
              value={store.dayCutoffHour}
              onChange={e => setStore(p => ({ ...p, dayCutoffHour: Math.min(23, Math.max(0, Number(e.target.value) || 0)) }))}
            />
          </Field>
          <Field label="Seuil de sangsue" hint="Oublis avant alerte.">
            <Input
              type="number"
              min={2}
              value={store.leechThreshold}
              onChange={e => setStore(p => ({ ...p, leechThreshold: Math.max(2, Number(e.target.value) || 8) }))}
            />
          </Field>
        </FieldGrid>

        <FieldGrid columns={2}>
          <Field label="Que faire d'une sangsue">
            <Select value={store.leechAction} onChange={e => setStore(p => ({ ...p, leechAction: e.target.value }))}>
              <option value="suspend">La suspendre</option>
              <option value="tag">La marquer seulement</option>
            </Select>
          </Field>
          <Field label="Cartes sœurs" hint="Deux cartes d'une même note dans la même séance.">
            <Select
              value={store.burySiblings ? "bury" : "keep"}
              onChange={e => setStore(p => ({ ...p, burySiblings: e.target.value === "bury" }))}
            >
              <option value="bury">Reporter la seconde à demain</option>
              <option value="keep">Les enchaîner</option>
            </Select>
          </Field>
        </FieldGrid>

        <FieldGrid columns={2}>
          <Field label="Bruit sur les intervalles" hint="Étale les cartes apprises ensemble pour qu'elles ne reviennent pas en peloton.">
            <Select
              value={config.enableFuzz ? "on" : "off"}
              onChange={e => setConfig({ enableFuzz: e.target.value === "on" })}
            >
              <option value="on">Activé</option>
              <option value="off">Désactivé</option>
            </Select>
          </Field>
        </FieldGrid>
      </div>

      {/* ── Algorithme ───────────────────────────────────────────────────── */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Algorithme</div>
          <div style={{ fontSize: 12, color: T.textSub, marginTop: 4, lineHeight: 1.6 }}>{COPY.algorithm}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: FIELD_BG, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: T.textSub }}>
            Poids actuels :{" "}
            <strong style={{ color: T.text, fontWeight: 600 }}>
              {isDefaultParameters(config.parameters) ? "ceux d'origine" : "optimisés pour vous"}
            </strong>
          </div>
          <div style={{ fontSize: 12, color: T.textSub, fontVariantNumeric: "tabular-nums" }}>
            {usable} révision{usable > 1 ? "s" : ""} exploitable{usable > 1 ? "s" : ""}
          </div>
        </div>

        {usable < MINIMUM_REVIEWS ? (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
            <AlertTriangle size={14} color={PALETTE.orange} style={{ flexShrink: 0, marginTop: 2 }} />
            {COPY.tooFewReviews(MINIMUM_REVIEWS)}
          </div>
        ) : usable < RECOMMENDED_REVIEWS ? (
          <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>
            {COPY.smallSample(RECOMMENDED_REVIEWS)}
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <PillButton
            variant="primary"
            disabled={running || usable < MINIMUM_REVIEWS}
            onClick={runOptimizer}
          >
            {running ? <Loader2 size={14} className="anim-spin" /> : <Sparkles size={14} />}
            {running ? "Calcul en cours…" : "Optimiser les poids"}
          </PillButton>
          {running && (
            <>
              <div style={{ flex: 1, minWidth: 120, height: 4, borderRadius: 999, background: FIELD_BG, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress * 100}%`, background: T.brand, transition: "width var(--dur-fast) linear" }} />
              </div>
              <PillButton compact variant="ghost" onClick={() => { stopRef.current = true; }}>Arrêter</PillButton>
            </>
          )}
          {!running && !isDefaultParameters(config.parameters) && (
            <PillButton compact onClick={() => { setConfig({ parameters: [...DEFAULT_PARAMETERS] }); setOutcome(null); }}>
              <RotateCcw size={13} /> {COPY.resetWeights}
            </PillButton>
          )}
        </div>

        {outcome && outcome.status !== "insufficient" && (
          <div style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: T.text }}>
              <Check size={14} color={PALETTE.green} />
              {outcome.status === "stopped" ? "Optimisation interrompue" : "Optimisation terminée"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 14, fontSize: 12 }}>
              <div>
                <div style={{ color: T.textSub, marginBottom: 2 }}>Erreur de prédiction</div>
                <div style={{ color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {outcome.before.rmse.toFixed(4).replace(".", ",")} → {outcome.after.rmse.toFixed(4).replace(".", ",")}
                </div>
              </div>
              <div>
                <div style={{ color: T.textSub, marginBottom: 2 }}>Réussite observée</div>
                <div style={{ color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {(outcome.after.observed * 100).toFixed(1).replace(".", ",")} %
                </div>
              </div>
              <div>
                <div style={{ color: T.textSub, marginBottom: 2 }}>Prédite par le modèle</div>
                <div style={{ color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {(outcome.after.predicted * 100).toFixed(1).replace(".", ",")} %
                </div>
              </div>
            </div>
            {outcome.after.rmse >= outcome.before.rmse && (
              <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6 }}>{COPY.noImprovement}</div>
            )}
            {!outcome.reliable && (
              <div style={{ fontSize: 12, color: PALETTE.orange, lineHeight: 1.6 }}>{COPY.unreliable}</div>
            )}
          </div>
        )}

        <details style={{ borderTop: `1px solid ${HAIRLINE}`, paddingTop: 12 }}>
          <summary style={{ fontSize: 12, color: T.textSub, cursor: "pointer" }}>{COPY.pasteWeights}</summary>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <Input
              value={paramInput}
              onChange={e => setParamInput(e.target.value)}
              placeholder="0.212, 1.2931, 2.3065, …"
            />
            {paramError && <div style={{ fontSize: 12, color: PALETTE.red }}>{paramError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <PillButton compact onClick={applyPastedParameters} disabled={!paramInput.trim()}>Reprendre</PillButton>
            </div>
            <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5 }}>{COPY.whereInAnki}</div>
            <div style={{ fontSize: 11, color: T.textMut, fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all", lineHeight: 1.5, marginTop: 4 }}>
              Vos poids : [{config.parameters.map(p => Number(p.toFixed(4))).join(", ")}]
            </div>
          </div>
        </details>
      </div>

      {/* ── Données ──────────────────────────────────────────────────────── */}
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Données</div>
          <div style={{ fontSize: 12, color: T.textSub, marginTop: 4, lineHeight: 1.6 }}>{COPY.dataFormats}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PillButton compact onClick={() => download("revisions-anki.txt", toAnkiText(store))}>
            <Download size={13} /> Export texte Anki
          </PillButton>
          <PillButton compact onClick={() => download("revisions-sauvegarde.json", toJsonBackup(store), "application/json")}>
            <Download size={13} /> Sauvegarde complète
          </PillButton>
          <label>
            <input type="file" accept=".json,application/json" onChange={onRestoreFile} style={{ display: "none" }} />
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
                borderRadius: 999, background: FIELD_BG, color: T.text,
                fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "var(--tr-ui)",
              }}
            >
              <Upload size={13} /> Restaurer une sauvegarde
            </span>
          </label>
        </div>
        {notice && <div style={{ fontSize: 12, color: T.textSub }}>{notice}</div>}
        <div style={{ fontSize: 11, color: T.textMut, lineHeight: 1.5, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 10 }}>
          {COPY.restoreWarning}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setConfig(defaultConfig())}
        style={{
          alignSelf: "flex-start", background: "none", border: "none", padding: 0,
          fontSize: 12, color: T.textMut, cursor: "pointer", textDecoration: "underline",
          fontFamily: "inherit",
        }}
      >
        {COPY.resetAll}
      </button>
    </div>
  );
}
