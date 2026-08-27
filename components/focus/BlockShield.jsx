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
import { ShieldCheck, AppWindow } from "lucide-react";
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
  /* Pas de session requise : une liste permanente coupe hors de toute session,
     et c'est même son intérêt. L'écran s'adapte — sans session, il n'y a ni
     temps restant à annoncer, ni session à arrêter. */
  if (!hit) return null;

  /* Trois situations, et elles ne se racontent pas pareil : un lien refusé n'a
     mené nulle part, une appli coupée était déjà ouverte et vient de repasser
     derrière, un onglet coupé n'a pas pu être renvoyé. Dire « bloqué » partout
     laisserait chercher ce qui a bien pu se passer. */
  const isApp = hit.kind === "app";
  const isSite = hit.kind === "site";
  const isWindow = hit.kind === "window";
  const left = session ? remainingMs(session, now) : null;
  const count = session ? session.attempts.length : 1;
  const line = LINES[Math.min(count, LINES.length) - 1] || LINES[0];
  const mode = session ? MODES[session.mode] : null;
  const accent = PALETTE.green;
  const Icon = isApp ? AppWindow : ShieldCheck;

  const title = isApp ? "Application coupée" : "Site bloqué";
  const heading = isApp
    ? `${hit.appName || targetLabel(hit.target, store)} est coupé`
    : `${targetLabel(hit.target, store)} est coupé`;

  /* Ce qui vient d'être fait à l'appareil, en une phrase, avant la liste
     responsable. Absent pour un lien intercepté : il ne s'est rien passé
     ailleurs, et l'annoncer inventerait un geste. */
  const done = isApp
    ? hit.closed
      /* Nommer la fermeture, et dire qu'elle a été propre : une app qui
         disparaît sans explication passe pour un plantage, et on la relance
         pour vérifier — ce qui relance aussi la distraction. */
      ? "L'application a été fermée — proprement, elle a eu le temps d'enregistrer."
      /* Elle a refusé : autorisation manquante, ou question posée avant de
         quitter. On ne prétend pas l'avoir fermée. */
      : "L'application n'a pas pu être fermée : la fenêtre est simplement repassée derrière celle-ci."
    : isSite
      /* Un site n'arrive ici que si le renvoi a ÉCHOUÉ : autrement, la page de
         blocage a pris la place de l'onglet et cet écran ne s'ouvre pas. Le
         dire, plutôt que d'annoncer un renvoi qui n'a pas eu lieu. */
      ? "Le site a été reconnu, mais l'onglet n'a pas pu être renvoyé : il est resté ouvert."
      : isWindow
        ? `Repéré au titre de la fenêtre ${hit.appName || "du navigateur"}, dont l'URL n'est pas lisible : l'onglet est resté ouvert.`
        : null;

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
            {/* Dit une fois, ici : rien n'a été fermé. Sans cette phrase, on
                referme l'écran en craignant d'avoir perdu ce qui était en cours
                de l'autre côté. */}
            {done && <>{done} </>}
            {hit.listName
              ? <>Liste « {hit.listName} », active jusqu&apos;à la fin de la session.</>
              : "Coupé par la session en cours."}
          </div>
        </div>

        <div style={{
          width: "100%", padding: "12px 14px", borderRadius: 10, background: FIELD_BG,
          fontSize: 13, color: T.textSub, lineHeight: 1.6,
        }}>
          {line}
        </div>

        <div style={{ fontSize: 12, color: T.textMut }}>
          {!session
            /* Sans session, il n'y a pas de fin à annoncer — et c'est le
               message : ce blocage-là ne s'arrête pas tout seul. */
            ? "Blocage permanent, actif sans session"
            : left === null
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
          {mode?.exit === "free" && (
            <PillButton variant="ghost" onClick={onEnd} style={{ width: "100%" }}>
              Arrêter la session
            </PillButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
