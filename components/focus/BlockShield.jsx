"use client";

/**
 * Écran de blocage — ce qui s'affiche au lieu de la distraction.
 *
 * Deux règles tiennent tout cet écran :
 *
 *   Il doit être LENT À LIRE. Un blocage qu'on referme par réflexe ne fait que
 *   déplacer le geste. La fenêtre est donc voilée (elle interrompt vraiment) et
 *   porte une phrase à lire, pas seulement une croix à cliquer.
 *
 *   Il ne doit pas GRONDER. Une tentative bloquée est un succès du dispositif :
 *   la décision prise à froid a tenu. Le ton dit ce qui reste à faire, jamais ce
 *   qu'on aurait dû faire.
 */

import React from "react";
import { ShieldCheck, MonitorOff, AppWindow } from "lucide-react";
import { T, FIELD_BG } from "@/lib/ui/tokens";
import { PALETTE } from "@/lib/ui/palette";
import { Modal, PillButton } from "@/components/ui/da";
import { MODES, remainingMs, targetLabel } from "@/lib/focus/model";
import { fmtDur } from "@/lib/focus/stats";

/** Phrases de retour. Choisies par le compte de tentatives, pas au hasard :
 *  revoir la même phrase à la deuxième tentative dirait moins que d'en voir une
 *  autre, et un tirage aléatoire ferait clignoter l'écran entre deux rendus. */
const LINES = [
  "Ce n'est pas l'envie qui décide, c'est ce que vous avez décidé avant elle.",
  "Deuxième fois. C'est le moment habituel où la session se perd — et où elle se gagne.",
  "L'envie repasse toutes les dix minutes. La session, elle, ne repasse pas.",
  "Notez ce que vous alliez chercher. Vous irez le chercher après.",
];

export default function BlockShield({ hit, session, store, now, onBack, onEnd }) {
  if (!hit || !session) return null;

  const away = hit.target === "away";
  /* Une appli reprise et un lien refusé ne se racontent pas pareil : dans un
     cas la fenêtre était déjà ouverte et on vient de la reprendre, dans l'autre
     rien ne s'est passé du tout. Le titre et la ligne d'explication le disent. */
  const native = hit.kind === "app" || hit.kind === "window";
  const left = remainingMs(session, now);
  const count = session.attempts.length;
  const line = LINES[Math.min(count, LINES.length) - 1] || LINES[0];
  const mode = MODES[session.mode];
  const accent = away ? PALETTE.orange : PALETTE.green;
  const Icon = away ? MonitorOff : native ? AppWindow : ShieldCheck;

  const title = away ? "Écart constaté" : native ? "Application coupée" : "Site bloqué";
  const heading = away
    ? `${fmtDur(hit.awayMs || 0)} hors de l'app`
    : hit.kind === "app"
      ? `${hit.appName || targetLabel(hit.target, store)} est coupé`
      : `${targetLabel(hit.target, store)} est coupé`;

  return (
    <Modal open title={title} onClose={onBack} draggable={false} scrim width={440}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 4px 4px", textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 999, display: "grid", placeItems: "center",
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
        }}>
          <Icon size={26} color={accent} />
        </div>

        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>
            {heading}
          </div>
          <div style={{ fontSize: 13, color: T.textSub, marginTop: 6, lineHeight: 1.6 }}>
            {away
              ? "L'écart est noté au journal de la session. Il ne l'annule pas."
              : <>
                  {native && (
                    <>
                      {hit.kind === "window" && hit.appName
                        ? `Repéré au titre de la fenêtre ${hit.appName}. `
                        : "La fenêtre est repassée derrière celle-ci. "}
                      {/* Dit une fois, ici : rien n'a été fermé. Sans cette
                          phrase, on referme l'écran en craignant d'avoir perdu
                          ce qui était en cours dans l'autre appli. */}
                      Rien n&apos;a été fermé.{" "}
                    </>
                  )}
                  {hit.listName
                    ? <>Liste « {hit.listName} », active jusqu&apos;à la fin de la session.</>
                    : "Coupé par la session en cours."}
                </>}
          </div>
        </div>

        <div style={{
          width: "100%", padding: "12px 14px", borderRadius: 10, background: FIELD_BG,
          fontSize: 13, color: T.textSub, lineHeight: 1.6,
        }}>
          {line}
        </div>

        <div style={{ fontSize: 12, color: T.textMut }}>
          {left === null
            ? `Session « ${session.name} » en cours`
            : <>Il reste <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtDur(left)}</strong> sur « {session.name} »</>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <PillButton variant="primary" onClick={onBack} style={{ width: "100%" }}>
            Revenir au focus
          </PillButton>
          {/* La sortie n'apparaît QUE si le mode la permet sans friction. En
              profond ou en verrouillé, elle vit sur l'écran de session, derrière
              sa phrase à recopier : la proposer ici serait offrir la porte au
              moment exact où l'on est le moins en état de la refuser. */}
          {mode.exit === "free" && (
            <PillButton variant="ghost" onClick={onEnd} style={{ width: "100%" }}>
              Arrêter la session
            </PillButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
