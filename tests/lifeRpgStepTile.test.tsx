import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

/* La tuile d'une étape est la pièce qu'on regarde le plus longtemps sur une
   carte, et son état ne se déduit d'aucune donnée nue — il naît de la
   combinaison mesure / franchi / retard. Ces cas la montent seule : la page
   entière tire un magasin nuage et le journal d'activité, dont rien ici ne
   dépend. */
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => [d, () => {}, true],
}));

import { StepRow, StepsBlock } from "@/components/pages/LifeRpgPage";

const CAT = { id: "sante", label: "Santé", color: "#4C6FFF" };
const TODAY = "2026-06-01";

const step = (id: string, label: string, done = false, due: string | null = null) =>
  ({ id, label, done, due, doneAt: done ? "2026-01-01T00:00:00.000Z" : null });

afterEach(cleanup);

/* ── La tuile d'une étape ─────────────────────────────────────────────────── */

const goal = (id: string, label: string, pct: number) =>
  ({ id, label, pct, rawPct: pct, current: pct, target: 100, unit: "", color: "#4C6FFF", pctOnly: true });

describe("tuile d'une étape", () => {
  const props = { cat: CAT, allObjectives: [], onToggle: () => {}, onRename: () => {}, onDelete: null };

  it("porte l'avancement du jalon au bout de sa ligne", () => {
    /* Il n'existait nulle part : il fallait additionner de tête les barres des
       objectifs rattachés, une fois la ligne dépliée. */
    render(
      <StepRow {...props} step={step("a", "Courir 10 km")} status="upcoming"
        goals={[goal("g1", "Km courus", 40), goal("g2", "Séances", 80)]} />,
    );
    expect(screen.getByText("60 %")).toBeTruthy();
  });

  it("replie les objectifs et dit combien il y en a", () => {
    render(
      <StepRow {...props} step={step("a", "Courir 10 km")} status="upcoming"
        goals={[goal("g1", "Km courus", 40), goal("g2", "Séances", 80)]} />,
    );
    // Repliée, la tuile ne montre pas le détail : elle dit le total et le compte.
    expect(screen.queryByText("Km courus")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Voir les objectifs/ }));
    expect(screen.getByText("Km courus")).toBeTruthy();
    expect(screen.getByText("Séances")).toBeTruthy();
  });

  it("garde le bouton d'ajout visible tant qu'aucun objectif ne la mesure", () => {
    /* Sans objectif, il n'y a rien à déplier — et cacher l'ajout derrière un
       dépliage supprimerait le seul chemin pour en rattacher un. */
    render(<StepRow {...props} step={step("a", "Marathon")} status="upcoming" goals={[]} onToggleObjective={() => {}} />);
    expect(screen.getByText("Objectif")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Voir les objectifs/ })).toBeNull();
  });

  it("ne pose une barre de pied que sur un jalon mesuré et non franchi", () => {
    /* Sans objectif rattaché, elle n'aurait que 0 ou 100 à montrer — c'est-à-dire
       ce que la pastille dit déjà. */
    const bars = (el: HTMLElement) => el.querySelectorAll("div[style*='height: 3px']").length;
    const mesure = render(<StepRow {...props} step={step("a", "Courir")} status="upcoming" goals={[goal("g", "Km", 60)]} />);
    expect(bars(mesure.container)).toBe(1);
    cleanup();
    const nue = render(<StepRow {...props} step={step("b", "Marathon")} status="upcoming" goals={[]} />);
    expect(bars(nue.container)).toBe(0);
    cleanup();
    const finie = render(<StepRow {...props} step={step("c", "Semi")} status="done" goals={[goal("g", "Km", 100)]} />);
    expect(bars(finie.container)).toBe(0);
  });
});

/* ── Le raccord entre deux tuiles ─────────────────────────────────────────── */

describe("chaîne des étapes", () => {
  it("relie les tuiles deux à deux, et s'arrête à la dernière", () => {
    /* Sans raccord, des tuiles séparées par du vide se lisent comme une liste de
       choses indépendantes — or un jalon n'a de sens que par sa place dans un
       parcours. Un trait après la dernière laisserait croire à une suite. */
    const { container } = render(
      <StepsBlock cat={CAT} steps={[step("a", "A", true), step("b", "B"), step("c", "C")]}
        today={TODAY} onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
    const links = container.querySelectorAll("div[aria-hidden='true'][style*='width: 1.5px']");
    expect(links.length).toBe(2);
  });

  it("colore le raccord qui suit une étape franchie, pas les autres", () => {
    // La couleur dit le chemin PARCOURU, comme sur la pastille qui le précède.
    const { container } = render(
      <StepsBlock cat={CAT} steps={[step("a", "A", true), step("b", "B"), step("c", "C")]}
        today={TODAY} onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
    const links = [...container.querySelectorAll("div[aria-hidden='true'][style*='width: 1.5px']")];
    expect((links[0] as HTMLElement).style.background).toBe("rgb(76, 111, 255)");
    expect((links[1] as HTMLElement).style.background).not.toBe("rgb(76, 111, 255)");
  });
});

/* ── Poser un jalon ───────────────────────────────────────────────────────── */

describe("ajout d'une étape", () => {
  const open = (onAdd: (l: string) => void) => {
    render(
      <StepsBlock cat={CAT} steps={[step("a", "A")]} today={TODAY} onAdd={onAdd}
        onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
  };

  it("ne montre qu'un emplacement tant qu'on n'écrit pas", () => {
    /* Le champ de saisie occupait la place d'une étape en permanence, alors
       qu'on en pose trois dans l'année. */
    open(() => {});
    expect(screen.getByRole("button", { name: "Ajouter une étape" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("Nouvelle étape…")).toBeNull();
  });

  it("s'ouvre en champ au clic, et pose le jalon à Entrée", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));

    const field = screen.getByPlaceholderText("Nouvelle étape…");
    fireEvent.change(field, { target: { value: "  Semi-marathon  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(added).toEqual(["Semi-marathon"]);
  });

  it("reste ouvert après un ajout — on en pose rarement un seul", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));

    const field = screen.getByPlaceholderText("Nouvelle étape…");
    fireEvent.change(field, { target: { value: "Semi" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.change(field, { target: { value: "Marathon" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(added).toEqual(["Semi", "Marathon"]);
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("se referme à Échap sans rien poser", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    const field = screen.getByPlaceholderText("Nouvelle étape…");
    fireEvent.change(field, { target: { value: "Oups" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(added).toEqual([]);
    expect(screen.getByRole("button", { name: "Ajouter une étape" })).toBeTruthy();
  });

  it("refuse un libellé vide", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    fireEvent.keyDown(screen.getByPlaceholderText("Nouvelle étape…"), { key: "Enter" });
    expect(added).toEqual([]);
  });
});
