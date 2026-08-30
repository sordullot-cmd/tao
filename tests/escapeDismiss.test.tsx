import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import React from "react";
import { useEscapeDismiss, __escapeStackSize } from "@/lib/hooks/useEscapeDismiss";

afterEach(cleanup);

/** Une couche qui s'annonce à la pile, comme le ferait une modale. */
function Layer({ onClose, open = true }: { onClose: () => void; open?: boolean }) {
  useEscapeDismiss(onClose, open);
  return null;
}

const escape = (init: KeyboardEventInit = {}) =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init }));
  });

describe("Échap ferme la couche ouverte", () => {
  it("ferme la modale", () => {
    const close = vi.fn();
    render(<Layer onClose={close} />);
    escape();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ignore les autres touches", () => {
    const close = vi.fn();
    render(<Layer onClose={close} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(close).not.toHaveBeenCalled();
  });

  it("ne ferme QUE la couche du dessus : c'est tout l'objet de la pile", () => {
    // Le défaut d'avant : un menu ouvert dans une modale, deux écouteurs sur
    // `document`, et Échap emportait la modale — donc le travail en cours.
    const fermeModale = vi.fn();
    const fermeMenu = vi.fn();
    render(
      <>
        <Layer onClose={fermeModale} />
        <Layer onClose={fermeMenu} />
      </>,
    );
    escape();
    expect(fermeMenu).toHaveBeenCalledTimes(1);
    expect(fermeModale).not.toHaveBeenCalled();
  });

  it("rend la main à la couche du dessous une fois celle du dessus refermée", () => {
    const fermeModale = vi.fn();
    const fermeMenu = vi.fn();
    const { rerender } = render(
      <>
        <Layer onClose={fermeModale} />
        <Layer onClose={fermeMenu} open />
      </>,
    );
    escape();
    rerender(
      <>
        <Layer onClose={fermeModale} />
        <Layer onClose={fermeMenu} open={false} />
      </>,
    );
    escape();
    expect(fermeModale).toHaveBeenCalledTimes(1);
  });

  it("ne réagit pas à une touche déjà traitée par un champ de saisie", () => {
    // Une autocomplétion qui se referme sur Échap a consommé l'appui : fermer
    // la modale par-dessus ferait deux effets pour un seul geste.
    const close = vi.fn();
    render(<Layer onClose={close} />);
    act(() => {
      const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      ev.preventDefault();
      document.dispatchEvent(ev);
    });
    expect(close).not.toHaveBeenCalled();
  });

  it("ne s'inscrit pas quand la couche est fermée", () => {
    const close = vi.fn();
    render(<Layer onClose={close} open={false} />);
    escape();
    expect(close).not.toHaveBeenCalled();
  });

  it("libère la pile au démontage, sans quoi une couche morte garderait la main", () => {
    const before = __escapeStackSize();
    const { unmount } = render(<Layer onClose={() => {}} />);
    expect(__escapeStackSize()).toBe(before + 1);
    unmount();
    expect(__escapeStackSize()).toBe(before);
  });

  it("appelle la dernière version du gestionnaire, sans se replacer au sommet", () => {
    // `onClose` est souvent une fonction recréée à chaque rendu. Re-souscrire à
    // chaque fois remonterait la couche au sommet et volerait la priorité au
    // menu ouvert par-dessus.
    const premier = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Layer onClose={premier} />);
    rerender(<Layer onClose={second} />);
    escape();
    expect(premier).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
