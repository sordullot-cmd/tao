import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";

/* Le squelette du calendrier est le SEUL du site dont la forme se vérifie au
   compte : sept colonnes, les cases vides du début de semaine, puis une tuile
   de 83 px par jour du mois. C'est aussi le seul écran assez lent pour qu'on le
   voie à l'œil — donc celui où une grille approchée se remarque. */

vi.mock("@/lib/contexts/AppContext", () => ({
  useApp: () => ({ tradesLoading: true, trades: [], tradesByAccount: [], accounts: [] }),
}));

import CalendarPage from "@/components/pages/CalendarPage";

const WEEKDAYS = 7;

describe("Squelette du calendrier", () => {
  beforeEach(() => { cleanup(); });

  it("reprend la grille du mois affiché, case pour case", () => {
    const { container } = render(<CalendarPage trades={[]} />);

    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
    const leading = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    /* Les tuiles de jour se reconnaissent à leur hauteur : c'est `DayCell` qui
       la fixe à 83 px, et c'est elle qui donne sa hauteur à la page entière. */
    const tiles = [...container.querySelectorAll(".anim-shimmer")]
      .filter(el => (el as HTMLElement).style.height === "83px");
    expect(tiles).toHaveLength(daysInMonth);

    /* Les cases vides de début de semaine sont de VRAIS trous, pas des tuiles
       grises : sinon le mois commence un jour trop tôt. */
    const grids = [...container.querySelectorAll("div")]
      .filter(el => (el as HTMLElement).style.gridTemplateColumns === "repeat(7,minmax(0,1fr))");
    expect(grids).toHaveLength(2);           // en-têtes de jours + grille des jours
    expect(grids[0].children).toHaveLength(WEEKDAYS);
    expect(grids[1].children).toHaveLength(leading + daysInMonth);
  });

  it("annonce le chargement une seule fois, sans énoncer les tuiles", () => {
    const { container } = render(<CalendarPage trades={[]} />);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    for (const bar of container.querySelectorAll(".anim-shimmer")) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
