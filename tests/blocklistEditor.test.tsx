import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import BlocklistEditor from "@/components/focus/BlocklistEditor";

afterEach(cleanup);

/** Monte l'éditeur vide et rend de quoi observer ce qu'il enregistrerait. */
function open(list?: object) {
  const onSave = vi.fn();
  render(<BlocklistEditor list={list} onSave={onSave} onClose={() => {}} />);
  const field = screen.getByLabelText("Rechercher une appli ou un site");
  const type = (v: string) => fireEvent.change(field, { target: { value: v } });
  const key = (k: string) => fireEvent.keyDown(field, { key: k });
  const save = () => {
    fireEvent.click(screen.getByText("Créer"));
    return onSave.mock.calls[0][0];
  };
  return { onSave, type, key, save };
}

describe("choix des applis à bloquer", () => {
  it("met en tête ce qui ressemble le plus à ce qui est tapé", () => {
    const { type } = open();
    type("disc");
    const rows = screen.getAllByRole("button").filter(el => el.getAttribute("aria-pressed") !== null);
    expect(within(rows[0]).getByText(/Disc/)).toBeTruthy();
    // Les familles ont disparu : on cherche, on ne range plus.
    expect(screen.queryByText("Réseaux sociaux")).toBeNull();
  });

  it("coche le résultat visé à Entrée, sans quitter le clavier", () => {
    const { type, key, save } = open();
    type("netflix");
    key("Enter");
    expect(save().itemIds).toEqual(["netflix"]);
  });

  it("laisse les flèches viser un autre résultat que le premier", () => {
    const { type, key, save } = open();
    type("st");
    fireEvent.keyDown(screen.getByLabelText("Rechercher une appli ou un site"), { key: "ArrowDown" });
    key("Enter");
    const first = save().itemIds;
    expect(first.length).toBe(1);
    expect(first[0]).not.toBe("steam");
  });

  it("montre ce qui est retenu sans qu'il faille le retrouver", () => {
    const { type, key } = open();
    type("netflix");
    key("Enter");
    /* La pastille est la seule preuve visible une fois la recherche vidée :
       c'est précisément ce qui manquait. */
    expect(screen.getByLabelText("Retirer Netflix")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Retirer Netflix"));
    expect(screen.queryByLabelText("Retirer Netflix")).toBeNull();
  });

  it("propose d'ajouter ce que le catalogue ignore, depuis le champ de recherche", () => {
    const { type, key, save } = open();
    type("figma.com");
    expect(screen.getByText(/Ajouter « figma.com »/)).toBeTruthy();
    key("Enter");
    expect(save().custom).toEqual([expect.objectContaining({ domain: "figma.com" })]);
  });

  it("efface la recherche à Échap plutôt que de fermer la fenêtre", () => {
    const onClose = vi.fn();
    render(<BlocklistEditor onSave={vi.fn()} onClose={onClose} />);
    const field = screen.getByLabelText("Rechercher une appli ou un site");
    fireEvent.change(field, { target: { value: "netflix" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect((field as HTMLInputElement).value).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });
});
