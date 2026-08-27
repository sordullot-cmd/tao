import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { AppRows, HourBars } from "@/components/activity/ActivityChrome";
import { PRODUCTIVITY_COLOR } from "@/lib/activity/categories";

const MIN = 60_000;

/** Une ligne de répartition, telle que `byApp` la produit. */
function app(label: string, minutes: number) {
  return { id: label, label, ms: minutes * MIN, pct: minutes, color: "#888", cat: "other", titles: [] };
}

describe("répartition par application", () => {
  it("retire les miettes dès qu'il y a plus de lignes que la limite", () => {
    /* Sous cinq minutes, une application a été ouverte, pas utilisée. Une
       journée normale en accumule des dizaines, et les déplier n'apprend rien. */
    const apps = [
      app("Chrome", 120), app("Code", 90), app("Slack", 30),
      app("Notes", 10), app("Aperçu", 3), app("Calculette", 1),
    ];
    render(<AppRows apps={apps} limit={5} minMs={5 * MIN} />);

    expect(screen.getByText("Chrome")).toBeTruthy();
    expect(screen.queryByText("Aperçu")).toBeNull();
    expect(screen.queryByText("Calculette")).toBeNull();

    // Quatre lignes gardées sur une limite de cinq : plus rien à déplier.
    expect(screen.queryByText(/Voir les/)).toBeNull();
    expect(screen.getByText(/2 sous .* masquées/)).toBeTruthy();
  });

  it("ne les cache pas non plus derrière « voir plus »", () => {
    const apps = [
      app("A", 60), app("B", 50), app("C", 40), app("D", 30),
      app("E", 20), app("F", 10), app("G", 2),
    ];
    render(<AppRows apps={apps} limit={5} minMs={5 * MIN} />);

    fireEvent.click(screen.getByText(/Voir les/));
    expect(screen.getByText("F")).toBeTruthy();
    expect(screen.queryByText("G")).toBeNull();
  });

  it("ne retire rien quand tout tient déjà à l'écran", () => {
    /* En deçà de la limite, il n'y a rien à nettoyer : masquer une ligne sur
       quatre serait de la perte sèche. */
    const apps = [app("A", 60), app("B", 2)];
    render(<AppRows apps={apps} limit={5} minMs={5 * MIN} />);

    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.queryByText(/masquée/)).toBeNull();
  });

  it("garde la liste brute quand la journée n'est faite que de miettes", () => {
    /* Tout retirer afficherait « rien à afficher » sur des heures bien réelles. */
    const apps = [app("A", 4), app("B", 3), app("C", 3), app("D", 2), app("E", 2), app("F", 1)];
    render(<AppRows apps={apps} limit={5} minMs={5 * MIN} />);

    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText(/Voir les 1 autres/)).toBeTruthy();
  });

  it("ne filtre rien quand aucun seuil n'est demandé", () => {
    // L'écran de classement corrige les applications inconnues, souvent brèves :
    // les masquer là retirerait précisément ce qu'on vient y faire.
    const apps = [
      app("A", 60), app("B", 50), app("C", 40),
      app("D", 30), app("E", 20), app("F", 1),
    ];
    render(<AppRows apps={apps} limit={5} />);

    fireEvent.click(screen.getByText(/Voir les/));
    expect(screen.getByText("F")).toBeTruthy();
  });
});

/* ── Graphes de nature ────────────────────────────────────────────────────── */

describe("graphes empilés par nature", () => {
  it("peint le rythme moyen avec les couleurs des trois natures", () => {
    /* Ces barres empilent productif / neutre / distraction. Elles portaient les
       couleurs écrites en dur, si bien qu'un changement de palette ne les
       atteignait pas — c'est exactement la dérive que ce cas empêche. */
    const hourly = [{ hour: 9, ms: 60 * MIN, productiveMs: 30 * MIN, distractingMs: 20 * MIN }];
    const { container } = render(<HourBars hourly={hourly} />);
    /* jsdom rend les couleurs en `rgb(...)` : on compare donc sur cette forme
       plutôt que sur l'hexadécimal écrit dans la charte. */
    const rgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const styles = [...container.querySelectorAll("div")].map(d => (d as HTMLElement).style.background);

    for (const c of Object.values(PRODUCTIVITY_COLOR)) {
      expect(styles).toContain(rgb(c));
    }
  });
});
