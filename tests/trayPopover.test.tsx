import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

/**
 * Le popover de la barre d'état (app/tray/page.tsx).
 *
 * Ce qui est vérifié ici n'est pas l'apparence — un test ne voit pas qu'un
 * panneau est joli — mais ce qui peut le rendre FAUX : c'est une vue sans
 * magasin, qui ne tient que par le pont de `lib/tray/native`. Trois façons de
 * casser en silence :
 *
 *   • il se peint à partir de `trayState` (sinon : panneau vide tant qu'une
 *     coche n'a pas bougé ailleurs, ce qui peut durer la journée) ;
 *   • un clic ÉMET et n'écrit rien (écrire ici ferait diverger le popover de la
 *     page Discipline, toutes deux sur la même clé) ;
 *   • la coche se pose tout de suite, sans attendre le retour — c'est ce qui
 *     distingue une case qui répond d'une case qui traîne.
 *
 * Le pont est remplacé plutôt que le paquet `@tauri-apps/*` : c'est justement à
 * ça qu'il sert (cf. `lib/focus/native`, `lib/capture/native`).
 */

const state = {
  title: "Scalp ouverture",
  items: [
    { id: "r1", label: "Biais journalier défini", done: true },
    { id: "r2", label: "FVG respectée identifiée", done: false },
  ],
  lists: [
    { id: "l1", name: "Scalp", active: true },
    { id: "l2", name: "Swing", active: false },
  ],
  recording: false,
};

const trayState = vi.fn(async () => state);
const trayEmit = vi.fn<(event: string, payload?: unknown) => Promise<void>>(async () => {});
const trayResize = vi.fn<(height: number) => Promise<void>>(async () => {});
const trayClose = vi.fn(async () => {});
const trayOpenMain = vi.fn(async () => {});
const trayQuit = vi.fn(async () => {});
/** Le dernier abonné, pour rejouer une poussée de la fenêtre principale. */
let push: ((s: typeof state) => void) | null = null;

vi.mock("@/lib/tray/native", async () => {
  const real = await vi.importActual<typeof import("@/lib/tray/native")>("@/lib/tray/native");
  return {
    ...real,
    trayState: () => trayState(),
    trayEmit: (e: string, p?: unknown) => trayEmit(e, p),
    trayResize: (h: number) => trayResize(h),
    trayClose: () => trayClose(),
    trayOpenMain: () => trayOpenMain(),
    trayQuit: () => trayQuit(),
    onTrayState: (cb: (s: typeof state) => void) => { push = cb; return () => { push = null; }; },
  };
});

/* `isTauri()` décide du texte de l'état vide, et de lui seul : tout le reste
   passe par le pont, déjà remplacé au-dessus. */
let desktop = true;
vi.mock("@/lib/notify", async () => {
  const real = await vi.importActual<typeof import("@/lib/notify")>("@/lib/notify");
  return { ...real, isTauri: () => desktop };
});

import TrayPopoverPage from "@/app/tray/page";
import { TRAY_JOURNAL, TRAY_SELECT, TRAY_TOGGLE } from "@/lib/tray/native";

async function mount() {
  const view = render(<TrayPopoverPage />);
  /* Rendre la main à la boucle d'événements plutôt que compter des
     microtâches : leur nombre dépend de la façon dont le pont est chargé, pas
     du composant. */
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return view;
}

describe("popover de la barre d'état", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trayState.mockResolvedValue(state);
    desktop = true;
    push = null;
    // jsdom n'a pas d'observateur de taille : la mesure renvoyée au Rust n'est
    // pas l'objet du test, il suffit qu'elle ne jette pas.
    window.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  it("se peint avec l'état que la coquille tenait déjà", async () => {
    await mount();
    expect(trayState).toHaveBeenCalled();
    expect(screen.getByText("Scalp ouverture")).toBeTruthy();
    expect(screen.getByText("Biais journalier défini")).toBeTruthy();
    expect(screen.getByText("1 / 2")).toBeTruthy();
  });

  it("coche sans attendre la coquille, et ne fait qu'émettre", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("FVG respectée identifiée")); });

    expect(trayEmit).toHaveBeenCalledWith(TRAY_TOGGLE, "r2");
    // La progression a bougé tout de suite, avant tout retour d'événement.
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("suit la liste que la fenêtre principale repousse", async () => {
    await mount();
    await act(async () => {
      push?.({ ...state, title: "Swing", items: [{ id: "r9", label: "Contexte H4", done: false }] });
    });
    expect(screen.getByText("Contexte H4")).toBeTruthy();
    expect(screen.queryByText("Biais journalier défini")).toBeNull();
  });

  it("passe le changement de liste à la coquille plutôt que de le décider", async () => {
    await mount();
    await act(async () => { fireEvent.click(screen.getByText("Swing")); });
    expect(trayEmit).toHaveBeenCalledWith(TRAY_SELECT, "l2");
  });

  it("envoie la note au journal et vide le champ", async () => {
    await mount();
    const field = screen.getByPlaceholderText("Noter au journal…");
    await act(async () => {
      fireEvent.change(field, { target: { value: "  sorti trop tôt sur NQ  " } });
      fireEvent.keyDown(field, { key: "Enter" });
    });
    // Rognée : une note se relit, et les espaces de saisie n'en font pas partie.
    expect(trayEmit).toHaveBeenCalledWith(TRAY_JOURNAL, "sorti trop tôt sur NQ");
    expect((field as HTMLTextAreaElement).value).toBe("");
  });

  it("garde la note quand ⇧⏎ demande une ligne de plus", async () => {
    await mount();
    const field = screen.getByPlaceholderText("Noter au journal…");
    await act(async () => {
      fireEvent.change(field, { target: { value: "premier point" } });
      fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    });
    expect(trayEmit).not.toHaveBeenCalledWith(TRAY_JOURNAL, expect.anything());
    expect((field as HTMLTextAreaElement).value).toBe("premier point");
  });

  it("n'envoie rien quand le champ ne contient que des espaces", async () => {
    await mount();
    const field = screen.getByPlaceholderText("Noter au journal…");
    await act(async () => {
      fireEvent.change(field, { target: { value: "   " } });
      fireEvent.keyDown(field, { key: "Enter" });
    });
    expect(trayEmit).not.toHaveBeenCalledWith(TRAY_JOURNAL, expect.anything());
  });

  it("dit ce qu'il est quand on l'ouvre hors de l'app de bureau", async () => {
    desktop = false;
    trayState.mockResolvedValue({ title: "", items: [], lists: [], recording: false });
    await mount();
    expect(screen.getByText(/app de bureau/)).toBeTruthy();
  });
});
