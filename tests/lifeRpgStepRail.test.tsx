import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, within } from "@testing-library/react";

/* Le rail est le seul étage PERMANENT du bloc « Étapes » : c'est lui qui doit
   dire où l'on en est sans qu'on déplie quoi que ce soit. Ces cas le montent
   seul — la page entière tire un magasin nuage et le journal d'activité, dont
   rien ici ne dépend. */
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => [d, () => {}, true],
}));

import { StepRail } from "@/components/pages/LifeRpgPage";

const CAT = { id: "sante", label: "Santé", color: "#4C6FFF" };
const TODAY = "2026-06-01";

const step = (id: string, label: string, done = false, due: string | null = null) =>
  ({ id, label, done, due, doneAt: done ? "2026-01-01T00:00:00.000Z" : null });

afterEach(cleanup);

describe("rail des jalons d'un objectif annuel", () => {
  it("dit sans rien déplier combien sont franchis et lequel vient", () => {
    /* Le défaut d'avant : replié, le bloc n'affichait qu'un rapport « 2/5 ».
       Un compte dit COMBIEN ; il ne dit ni où l'on en est, ni vers quoi on
       marche. */
    render(
      <StepRail
        steps={[step("a", "Premier 5 km", true), step("b", "Semi", true), step("c", "Courir 10 km"), step("d", "Marathon")]}
        cat={CAT} today={TODAY} stepPcts={{}}
      />,
    );
    const rail = screen.getByRole("img");
    expect(rail.getAttribute("aria-label")).toContain("2 franchis sur 4");
    expect(screen.getByText("Courir 10 km")).toBeTruthy();
  });

  it("nomme la PREMIÈRE non franchie, pas la plus avancée", () => {
    /* On suit un chemin dans l'ordre où il a été posé : un jalon plus loin qui
       a commencé à bouger ne devient pas « la prochaine étape ». */
    render(
      <StepRail
        steps={[step("a", "Premier 5 km"), step("b", "Semi")]}
        cat={CAT} today={TODAY} stepPcts={{ b: [80] }}
      />,
    );
    expect(screen.getByText("Premier 5 km")).toBeTruthy();
    expect(screen.queryByText("Semi")).toBeNull();
  });

  it("montre l'avancement d'un jalon mesuré par ses objectifs", () => {
    render(
      <StepRail steps={[step("a", "Courir 10 km")]} cat={CAT} today={TODAY} stepPcts={{ a: [40, 80] }} />,
    );
    // La moyenne de ses objectifs : « à mi-chemin », que plein/vide ne sait pas dire.
    expect(screen.getByText("60 %")).toBeTruthy();
  });

  it("dit quand le chemin est fini, au lieu de laisser la ligne vide", () => {
    render(<StepRail steps={[step("a", "Premier 5 km", true)]} cat={CAT} today={TODAY} stepPcts={{}} />);
    expect(screen.getByText("Toutes les étapes sont franchies")).toBeTruthy();
  });

  it("se tait plutôt que de tasser des points illisibles", () => {
    /* Une carte fait un tiers de largeur : au-delà de neuf jalons, le rail ne
       montrerait plus qu'une rangée de points indistincts. La liste dépliée,
       elle, reste exhaustive. */
    const many = Array.from({ length: 10 }, (_, i) => step(`s${i}`, `Jalon ${i}`));
    const { container } = render(<StepRail steps={many} cat={CAT} today={TODAY} stepPcts={{}} />);
    expect(container.firstChild).toBeNull();
    expect(render(<StepRail steps={[]} cat={CAT} today={TODAY} stepPcts={{}} />).container.firstChild).toBeNull();
  });

  it("porte un point par jalon, et un connecteur entre chacun", () => {
    const { container } = render(
      <StepRail steps={[step("a", "A", true), step("b", "B"), step("c", "C")]} cat={CAT} today={TODAY} stepPcts={{}} />,
    );
    const rail = within(container).getByRole("img");
    // Trois pastilles + deux connecteurs.
    expect(rail.querySelectorAll("span").length).toBe(5);
  });
});
