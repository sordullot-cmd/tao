"use client";

/**
 * Session en cours — l'écran qui remplace tout le reste tant qu'elle tourne.
 *
 * Un seul chiffre y est gros : le temps qui reste. Tout le reste (listes
 * actives, écarts, pauses) est du contexte, et doit se lire sans jamais entrer
 * en concurrence avec lui. La sortie, elle, est volontairement l'élément le
 * moins accueillant de l'écran : c'est la seule décision qu'on ne veut pas
 * rendre facile.
 */

import React, { useState } from "react";
import { Play, ShieldCheck, Lock, Brain, Plus, Coffee } from "lucide-react";
import { T, FIELD_BG, HAIRLINE } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { CARD, Input, PillButton } from "@/components/ui/da";
import {
  EXIT_PHRASE, MODES, canPause, focusedMs, isDone, listSize, progress, remainingMs,
} from "@/lib/focus/model";
import { fmtClock, fmtDur } from "@/lib/focus/stats";

const RING = 132;
const STROKE = 9;

/** Anneau de progression. Le trait part en haut et tourne dans le sens horaire :
 *  c'est le sens d'un cadran, et l'anneau doit se lire comme une horloge. */
function Ring({ ratio, color, children }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: RING, height: RING, flexShrink: 0 }}>
      <svg width={RING} height={RING} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke={HAIRLINE} strokeWidth={STROKE} />
        <circle
          cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke={color} strokeWidth={STROKE}
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, ratio)))}
          style={{ transition: "stroke-dashoffset 900ms linear" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        {children}
      </div>
    </div>
  );
}

/** Pastille d'un mode : son nom, à sa couleur. */
function ModeBadge({ mode }) {
  const m = MODES[mode];
  const color = PALETTE[m.color] || T.textSub;
  const Icon = mode === "locked" ? Lock : mode === "deep" ? Brain : ShieldCheck;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999,
      background: `color-mix(in srgb, ${color} 14%, transparent)`, color, fontSize: 11, fontWeight: 600,
    }}>
      <Icon size={12} /> {m.label}
    </span>
  );
}

export default function SessionRunner({ session, store, now, onPause, onResume, onEnd, onExtend }) {
  const [exiting, setExiting] = useState(false);
  const [typed, setTyped] = useState("");

  const mode = MODES[session.mode];
  const color = PALETTE[mode.color] || T.text;
  const left = remainingMs(session, now);
  const done = isDone(session, now);
  const paused = Boolean(session.pausedAt);
  const lists = store.blocklists.filter(b => session.blocklistIds.includes(b.id));
  const targets = lists.reduce((s, b) => s + listSize(b), 0);

  const attempts = session.attempts.filter(a => a.target !== "away");
  const aways = session.attempts.filter(a => a.target === "away");
  const awayMs = aways.reduce((s, a) => s + (a.awayMs || 0), 0);

  /* Ce qu'il faut pour sortir avant la fin, par cran de fermeté. La session
     terminée se ferme toujours d'un clic : la friction protège la session, pas
     l'écran de fin. En verrouillé, il n'y a rien à demander — on ne sort pas. */
  const sealed = mode.exit === "none" && !done;
  const canExitNow = done
    || mode.exit === "free"
    || (mode.exit === "typed" && typed.trim().toLowerCase() === EXIT_PHRASE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...CARD, padding: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{session.name}</span>
          <ModeBadge mode={session.mode} />
        </div>

        <Ring ratio={session.plannedMs ? progress(session, now) : 0} color={paused ? T.textMut : color}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {left === null ? fmtClock(focusedMs(session, now)) : fmtClock(left)}
            </div>
            <div style={{ fontSize: 11, color: T.textSub, marginTop: 3 }}>
              {paused ? "en pause" : left === null ? "écoulé" : done ? "terminé" : "restant"}
            </div>
          </div>
        </Ring>

        {/* Ce que la session coupe, en une ligne : sans ça, l'écran ne dit plus
            de quoi on s'est protégé une fois lancé. */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {lists.length === 0 && (
            <span style={{ fontSize: 12, color: T.textMut }}>Aucune liste : minuteur seul.</span>
          )}
          {lists.map(b => (
            <span key={b.id} style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999,
              background: FIELD_BG, fontSize: 12, color: T.textSub,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: PALETTE[b.color] || T.textSub }} />
              {b.name}
              {b.mode === "allow" && <span style={{ fontSize: 10, color: PALETTE.orange }}>seule autorisée</span>}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {done ? (
            <PillButton variant="primary" onClick={() => onEnd("completed")}>
              Terminer et enregistrer
            </PillButton>
          ) : (
            <>
              {paused ? (
                <PillButton variant="primary" onClick={onResume}><Play size={14} /> Reprendre</PillButton>
              ) : (
                <PillButton
                  disabled={!canPause(session)}
                  onClick={onPause}
                  title={canPause(session) ? undefined : `Aucune pause en mode ${mode.label.toLowerCase()}`}
                >
                  <Coffee size={14} /> Pause {mode.breaks ? `(${mode.breaks - session.breaks} restante${mode.breaks - session.breaks > 1 ? "s" : ""})` : ""}
                </PillButton>
              )}
              {Boolean(session.plannedMs) && (
                <PillButton onClick={() => onExtend(15)}><Plus size={14} /> 15 min</PillButton>
              )}
              {/* Verrouillé : pas de bouton « Arrêter » du tout. Un bouton
                  désactivé serait une porte fermée qu'on continue de pousser —
                  et la seule chose qu'on ait à décider ici est déjà décidée. */}
              {!sealed && (
                <PillButton variant="ghost" onClick={() => setExiting(v => !v)}>Arrêter</PillButton>
              )}
            </>
          )}
        </div>

        {sealed && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 999,
            background: FIELD_BG, fontSize: 12, color: T.textSub,
          }}>
            <Lock size={13} style={{ flexShrink: 0 }} />
            Verrouillée jusqu’au bout — il reste {fmtDur(left || 0)}. Ni pause, ni arrêt.
          </div>
        )}

        {/* La sortie ne s'ouvre qu'à la demande, et elle porte son prix. */}
        {exiting && !done && !sealed && (
          <div style={{
            width: "100%", maxWidth: 460, padding: 16, borderRadius: 12,
            background: FIELD_BG, display: "flex", flexDirection: "column", gap: 10,
          }}>
            {mode.exit === "free" && (
              <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
                Il reste {fmtDur(left || 0)}. La session sera enregistrée comme interrompue.
              </div>
            )}
            {mode.exit === "typed" && (
              <>
                <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
                  Recopiez <strong style={{ color: T.text }}>« {EXIT_PHRASE} »</strong> pour arrêter maintenant.
                </div>
                <Input value={typed} onChange={e => setTyped(e.target.value)} placeholder={EXIT_PHRASE} autoFocus />
              </>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <PillButton variant="ghost" compact onClick={() => { setExiting(false); setTyped(""); }}>
                Continuer la session
              </PillButton>
              <PillButton
                variant="danger" compact disabled={!canExitNow}
                onClick={() => onEnd("abandoned")}
              >
                Arrêter maintenant
              </PillButton>
            </div>
          </div>
        )}
      </div>

      {/* Trois mesures de la session, et rien de plus : ce qui est arrivé
          pendant qu'elle tournait. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          { label: "Concentré", value: fmtDur(focusedMs(session, now)), hint: session.plannedMs ? `objectif ${fmtDur(session.plannedMs)}` : "chronomètre libre" },
          { label: "Blocages", value: attempts.length, hint: `${targets} cible${targets > 1 ? "s" : ""} coupée${targets > 1 ? "s" : ""}` },
          { label: "Écarts", value: aways.length, hint: awayMs ? `${fmtDur(awayMs)} hors de l'app` : "attention tenue" },
        ].map(item => (
          <div key={item.label} style={{ ...CARD, padding: 14 }}>
            <div style={{ fontSize: 11, color: T.textSub }}>{item.label}</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: T.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              {item.value}
            </div>
            <div style={{ fontSize: 11, color: T.textMut, marginTop: 2 }}>{item.hint}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
