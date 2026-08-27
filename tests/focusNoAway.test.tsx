import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";

/* Le garde web seul : ces cas ne disent rien du poste, ils disent ce que la
   page fait — ou ne fait plus — quand on la quitte. */
vi.mock("@/lib/focus/native", () => ({
  nativeAvailable: () => false,
  webAppInstalled: () => false,
  frontSnapshot: async () => null,
  frontTab: async () => null,
  reclaimFocus: async () => false,
  redirectTab: async () => false,
}));

import { useFocusGuard, type GuardHit } from "@/lib/focus/guard";
import { emptyStore, sessionFromPreset } from "@/lib/focus/model";

const store = emptyStore();
const session = sessionFromPreset(
  { id: "p", name: "Test", durationMin: 30, blocklistIds: ["bl-msg"], mode: "normal", color: "blue", icon: "timer" },
  new Date()
);

function Harness({ onHit }: { onHit: (h: GuardHit) => void }) {
  useFocusGuard(session, store, onHit);
  return null;
}

describe("sorties de l'app", () => {
  it("ne compte rien quand on quitte la fenêtre pendant une session", async () => {
    /* Travailler hors de cette fenêtre — un terminal, un graphique, un carnet —
       n'est pas une distraction. Le seul signal qu'une page web sache produire
       là-dessus mesurait l'attention à l'endroit exact où elle n'a pas à l'être,
       et chaque retour ouvrait un écran pour reprocher une absence légitime. */
    const hits: GuardHit[] = [];
    render(<Harness onHit={h => hits.push(h)} />);

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(hits).toHaveLength(0);
  });
});
