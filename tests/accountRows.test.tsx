import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TableRow, RowIconButton } from "@/components/ui/accountRows";

/* Le chevron d'une ligne de firme a deux exigences opposées : déplier la liste
   des comptes, et ne PAS déclencher la navigation de la ligne (qui ouvre la
   fiche de la firme). Les deux se testent ensemble — c'est leur combinaison qui
   avait cassé. */
describe("TableRow — chevron d'une ligne dépliable", () => {
  const renderRow = (props = {}) => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    const utils = render(
      <TableRow
        label="Topstep"
        cells={["3", "$150 000", "61%", "$0"]}
        expandable
        open={false}
        onToggle={onToggle}
        onOpen={onOpen}
        flat
        {...props}
      >
        <div>Compte enfant</div>
      </TableRow>
    );
    return { onToggle, onOpen, ...utils };
  };

  it("déplie au clic sur le chevron, sans ouvrir la fiche", () => {
    const { onToggle, onOpen } = renderRow();
    fireEvent.click(screen.getByRole("button", { name: /déplier|expand/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("n'ouvre la fiche que depuis le reste de la ligne", () => {
    const { onToggle, onOpen } = renderRow();
    fireEvent.click(screen.getByText("Topstep"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  /* Garantie structurelle : tant que le chevron vivait DANS la zone cliquable,
     il fallait intercepter l'événement à la main — et un clic dont la cible
     était le SVG passait au travers. Il doit rester en dehors. */
  it("place le chevron hors de la zone de navigation", () => {
    renderRow();
    const chevron = screen.getByRole("button", { name: /déplier|expand/i });
    expect(chevron.closest('[role="button"]')).toBeNull();
  });

  it("n'ouvre pas la fiche quand le clic vise l'icône elle-même", () => {
    const { onToggle, onOpen } = renderRow();
    const chevron = screen.getByRole("button", { name: /déplier|expand/i });
    const icon = chevron.querySelector("svg");
    expect(icon).toBeTruthy();
    // Un clic dont la cible est le SVG : il remonte au bouton, puis à la ligne.
    fireEvent.click(icon!);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("déplie au clavier sans ouvrir la fiche", () => {
    const { onToggle, onOpen } = renderRow();
    const chevron = screen.getByRole("button", { name: /déplier|expand/i });
    fireEvent.keyDown(chevron, { key: "Enter" });
    fireEvent.click(chevron); // ce qu'un <button> natif produit après Entrée
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("ne rend les enfants que lorsque la ligne est ouverte", () => {
    const { rerender } = renderRow();
    expect(screen.queryByText("Compte enfant")).toBeNull();
    rerender(
      <TableRow label="Topstep" cells={["3"]} expandable open onToggle={() => {}} onOpen={() => {}} flat>
        <div>Compte enfant</div>
      </TableRow>
    );
    expect(screen.getByText("Compte enfant")).toBeTruthy();
  });
});

/* La corbeille de fin de ligne : un clic doit l'atteindre OÙ QU'IL TOMBE dans
   sa surface — y compris pile sur l'icône, qui occupe le centre exact de la
   cible. C'est le cas qui échouait : « seules les extrémités marchaient ». */
describe("RowIconButton — cible du clic", () => {
  const renderWithAction = () => {
    const onDelete = vi.fn();
    const onOpen = vi.fn();
    const utils = render(
      <TableRow
        label="Topstep"
        cells={["3", "$150 000", "61%", "$0"]}
        onOpen={onOpen}
        flat
        actions={
          <RowIconButton label="Supprimer" danger onClick={onDelete}>
            <svg data-testid="trash-icon" width={14} height={14} />
          </RowIconButton>
        }
      />
    );
    return { onDelete, onOpen, ...utils };
  };

  it("déclenche l'action au clic sur le bouton lui-même", () => {
    const { onDelete, onOpen } = renderWithAction();
    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("déclenche l'action au clic sur l'ICÔNE, pas la navigation de la ligne", () => {
    const { onDelete, onOpen } = renderWithAction();
    fireEvent.click(screen.getByTestId("trash-icon"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
