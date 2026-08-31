import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";

/* La page tire Supabase, le cache de trades et les réglages : rien de tout cela
   ne décide de l'ordre des évènements de pointeur, qui est le seul sujet ici. */
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }),
}));
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => [d, () => {}, true],
}));

import { TimelineRow } from "@/components/pages/GoalsPage";

afterEach(cleanup);

const GOAL = { id: Date.now(), label: "Courir 500 km", target: 500, subtasks: [] };

function row() {
  const setDrag = vi.fn();
  const { container } = render(
    <TimelineRow goal={GOAL}
      compute={() => ({ current: 100, target: 500, pct: 20, rawPct: 20 })}
      unitOf={() => "km"} fmtVal={(v: number) => String(v)}
      drag={{ sourceId: null, overId: null, mode: null }} setDrag={setDrag} onDrop={() => {}} />,
  );
  return { el: container.querySelector(".tr4de-goals-row") as HTMLElement, setDrag };
}

/** Un `dragstart` dont on peut relire si quelqu'un l'a annulé. */
function dragStart(el: HTMLElement) {
  const ev = new Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "dataTransfer", { value: { setData: () => {}, effectAllowed: "" } });
  fireEvent(el, ev);
  return ev;
}

describe("glisser une ligne d'objectif pour la réordonner", () => {
  it("part quand le navigateur annule le pointeur AVANT le glissé", () => {
    /* C'est l'ordre de WebKit — donc de l'app de bureau. Il est permis par la
       spec Pointer Events ; Chromium, lui, envoie l'annulation APRÈS. La ligne
       désarmait son glissé sur ces évènements-là : dans Arc tout marchait,
       dans l'app de bureau rien ne bougeait, et sans le moindre message. */
    const { el, setDrag } = row();
    fireEvent.pointerDown(el, { pointerType: "mouse", button: 0 });
    fireEvent.pointerCancel(el);
    fireEvent.pointerLeave(el);

    const ev = dragStart(el);
    expect(ev.defaultPrevented).toBe(false);
    expect(setDrag).toHaveBeenCalledWith(expect.objectContaining({ sourceId: GOAL.id }));
  });

  it("part aussi dans l'ordre de Chromium", () => {
    const { el, setDrag } = row();
    fireEvent.pointerDown(el, { pointerType: "mouse", button: 0 });
    const ev = dragStart(el);
    expect(ev.defaultPrevented).toBe(false);
    expect(setDrag).toHaveBeenCalled();
  });

  it("refuse toujours de partir depuis une commande de la ligne", () => {
    /* Le garde-fou d'origine reste : on n'attrape pas un objectif en tirant sur
       sa case à cocher ou son bouton. */
    const { el, setDrag } = row();
    const button = el.querySelector("button");
    expect(button).not.toBeNull();
    fireEvent.pointerDown(button as HTMLElement, { pointerType: "mouse", button: 0 });
    const ev = dragStart(el);
    expect(ev.defaultPrevented).toBe(true);
    expect(setDrag).not.toHaveBeenCalled();
  });

  it("se désarme quand le doigt se lève sans avoir rien tiré", () => {
    const { el, setDrag } = row();
    fireEvent.pointerDown(el, { pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(el);
    const ev = dragStart(el);
    expect(ev.defaultPrevented).toBe(true);
    expect(setDrag).not.toHaveBeenCalled();
  });
});
