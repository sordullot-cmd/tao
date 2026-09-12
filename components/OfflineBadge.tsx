"use client";

/**
 * OfflineBadge — dit, en une pastille, que l'app tourne sans réseau.
 *
 * Hors ligne tout continue : le vault est lu sur le disque, notes et trades
 * partent de localStorage, et les écritures cloud attendent leur tour dans
 * `useCloudState`. Rien n'est perdu — mais rien ne le disait non plus. L'échec
 * ne vivait que dans un `console.warn` que personne n'ouvre, et une synchro
 * silencieusement en attente ressemble, de l'extérieur, à une synchro faite.
 *
 * D'où la pastille : elle n'existe que pour rendre l'attente lisible. Elle
 * n'apparaît donc QUE hors ligne, et disparaît d'elle-même au retour du réseau.
 */

import { useEffect, useState } from "react";
import { T } from "@/lib/ui/tokens";
import { TYPE } from "@/lib/ui/type";

export default function OfflineBadge() {
  // Jamais `navigator.onLine` à l'initialisation : le rendu serveur ne le
  // connaît pas, et l'écart ferait échouer l'hydratation.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 16,
        bottom: 16,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        background: T.amberBg,
        border: `1px solid ${T.amberBd}`,
        color: T.text,
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
        ...TYPE.caption,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: T.amber,
          flexShrink: 0,
        }}
      />
      Hors ligne — tes modifications sont gardées et partiront au retour du réseau.
    </div>
  );
}
