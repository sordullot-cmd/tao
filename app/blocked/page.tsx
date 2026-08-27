"use client";

/**
 * Page de blocage — ce qu'un onglet coupé affiche à la place du site.
 *
 * C'est le pendant, côté navigateur, de l'écran `BlockShield` qui s'affiche
 * dans l'app. Les deux disent la même chose parce qu'il s'agit du même moment :
 * la coquille de bureau reprend le premier plan ET renvoie l'onglet ici, si
 * bien que la personne voit le premier écran tout de suite, et celui-ci en
 * retournant à son navigateur. Retrouver la même phrase des deux côtés dit que
 * c'est bien une décision, et pas un incident de navigation.
 *
 * Trois règles tiennent cette page :
 *
 *   Elle est LENTE À LIRE. Une page de blocage qu'on referme par réflexe ne
 *   fait que déplacer le geste.
 *
 *   Elle ne GRONDE pas. Une tentative bloquée est un succès du dispositif : la
 *   décision prise à froid a tenu.
 *
 *   Elle ne dépend de RIEN. Pas de session, pas d'appel réseau, pas de compte :
 *   elle est atteinte depuis un navigateur qui n'est peut-être pas connecté, et
 *   tout ce qu'elle affiche tient dans son adresse. C'est aussi pourquoi cette
 *   adresse ne porte qu'un nom de site et un nom de liste — elle atterrit dans
 *   l'historique du navigateur, et rien de plus intime n'a à s'y trouver.
 */

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { T, HAIRLINE, WRITING_BG } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";
import { PALETTE } from "@/lib/ui/palette";

/** Les mêmes phrases que l'écran de blocage de l'app, dans le même ordre. */
const LINES = [
  "Ce n'est pas l'envie qui décide, c'est ce que vous avez décidé avant elle.",
  "Deuxième fois. C'est le moment habituel où la session se perd — et où elle se gagne.",
  "L'envie repasse toutes les dix minutes. La session, elle, ne repasse pas.",
  "Notez ce que vous alliez chercher. Vous irez le chercher après.",
];

/** Durée en h/min, arrondie à la minute : à cette échelle, la seconde qui
 *  défile presse au lieu d'apaiser, et c'est le contraire du but. */
function fmtLeft(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `${h} h ${String(rest).padStart(2, "0")}` : `${h} h`;
}

function Blocked() {
  const params = useSearchParams();
  const target = params.get("t") || "Ce site";
  const list = params.get("l");
  const session = params.get("s");
  const until = Number(params.get("u")) || 0;
  const attempt = Number(params.get("n")) || 1;
  const line = LINES[Math.min(attempt, LINES.length) - 1] || LINES[0];

  /* Le compte à rebours ne vit que dans le rendu : l'état, c'est l'heure de
     fin, passée dans l'adresse. Le minuteur ne sert qu'à redemander l'heure,
     et il s'arrête dès qu'il n'y a plus rien à décompter. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, [until]);
  const left = until ? Math.max(0, until - now) : 0;

  return (
    <main style={{
      minHeight: "100vh", display: "grid", placeItems: "center", padding: 24,
      background: WRITING_BG, color: T.text,
    }}>
      <div style={{ maxWidth: 460, width: "100%", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 999, display: "grid", placeItems: "center",
          background: `color-mix(in srgb, ${PALETTE.green} 14%, transparent)`,
        }}>
          <ShieldCheck size={30} color={PALETTE.green} />
        </div>

        <div>
          <h1 style={{ ...TYPE.title2, fontWeight: 600, margin: 0 }}>
            {target} est coupé
          </h1>
          <p style={{ ...TYPE.callout, fontWeight: 400, color: T.textSub, margin: "10px 0 0", lineHeight: 1.6 }}>
            {list
              ? <>Liste « {list} », active jusqu&apos;à la fin de la session.</>
              : "Coupé par une session de focus en cours."}
            {" "}L&apos;onglet a été renvoyé ici — un retour arrière ramène la page.
          </p>
        </div>

        <p style={{
          width: "100%", margin: 0, padding: "16px 18px", borderRadius: 12,
          background: T.surface, border: `1px solid ${HAIRLINE}`,
          ...TYPE.callout, fontWeight: 400, color: T.textSub, lineHeight: 1.7,
        }}>
          {line}
        </p>

        <p style={{ ...TYPE.body, color: T.textMut, margin: 0 }}>
          {left > 0
            ? <>Il reste <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtLeft(left)}</strong>{session ? <> sur « {session} »</> : null}</>
            : session
              ? <>Session « {session} » en cours</>
              : "Session de focus en cours"}
        </p>

        {/* Pas de « continuer quand même » : la sortie vit dans l'app, derrière
            la friction que le mode de session impose. L'offrir ici la
            contournerait, au moment exact où l'on est le moins en état de la
            refuser. */}
        <Link
          href="/dashboard"
          style={{
            ...TYPE.body, color: T.textSub, textDecoration: "none",
            padding: "9px 16px", borderRadius: 999,
            border: `1px solid ${HAIRLINE}`,
          }}
        >
          Revenir à tao trade
        </Link>
      </div>
    </main>
  );
}

/* `useSearchParams` impose une frontière de suspense : sans elle, tout ce qui
   est au-dessus serait rendu à la demande, alors que cette page doit pouvoir
   être servie statiquement — elle s'affiche sur un poste dont on vient de
   couper la distraction, pas sur un poste patient. */
export default function BlockedPage() {
  return (
    <Suspense fallback={null}>
      <Blocked />
    </Suspense>
  );
}
