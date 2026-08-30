import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { AppRows, CrumbNote, HourBars } from "@/components/activity/ActivityChrome";
import { PRODUCTIVITY_COLOR } from "@/lib/activity/categories";
import { ranked, SHOWN_MIN_MS } from "@/lib/activity/stats";

const MIN = 60_000;

/** Une ligne de répartition, telle que `byApp` la produit. */
function app(label: string, minutes: number) {
  return { id: label, label, ms: minutes * MIN, pct: minutes, color: "#888", cat: "other", titles: [] };
}

describe("seuil des classements", () => {
  it("écarte ce qui a été ouvert plutôt qu'utilisé", () => {
    /* Sous cinq minutes, une application a été ouverte, pas utilisée. Une
       journée normale en accumule des dizaines, et les déplier n'apprend rien. */
    const kept = ranked([app("Chrome", 120), app("Aperçu", 3), app("Calculette", 1)]);

    expect(kept.map(a => a.label)).toEqual(["Chrome"]);
  });

  it("garde ce qui touche le seuil au lieu de l'écarter de justesse", () => {
    // Cinq minutes tout rond est du temps passé : c'est en dessous que ça s'arrête.
    expect(ranked([app("Notes", 5)])).toHaveLength(1);
  });

  it("laisse la liste d'origine intacte", () => {
    /* Les totaux se calculent sur la liste brute : si `ranked` la vidait au
       passage, le temps actif se mettrait à suivre le seuil d'affichage. */
    const apps = [app("Chrome", 120), app("Aperçu", 3)];
    ranked(apps);

    expect(apps).toHaveLength(2);
  });
});

describe("répartition par application", () => {
  it("montre ce qu'on lui donne, sans seuil de son côté", () => {
    /* Le seuil est posé une fois pour toute la section (cf. `ranked`) : la liste
       qui le reposerait ici en ferait deux règles à tenir d'accord — et l'écran
       de classement, lui, a précisément besoin des lignes brèves pour ranger les
       applications inconnues. */
    render(<AppRows apps={[app("A", 60), app("B", 1)]} limit={5} />);

    expect(screen.getByText("B")).toBeTruthy();
  });

  it("replie ce qui dépasse la limite derrière un seul bouton", () => {
    const apps = [
      app("A", 60), app("B", 50), app("C", 40),
      app("D", 30), app("E", 20), app("F", 10), app("G", 5),
    ];
    render(<AppRows apps={apps} limit={5} />);

    expect(screen.queryByText("F")).toBeNull();
    fireEvent.click(screen.getByText(/Voir les 2 autres/));
    expect(screen.getByText("F")).toBeTruthy();
    expect(screen.getByText("G")).toBeTruthy();
  });

  it("ne propose rien à déplier quand tout tient déjà à l'écran", () => {
    render(<AppRows apps={[app("A", 60), app("B", 50)]} limit={5} />);

    expect(screen.queryByText(/Voir les/)).toBeNull();
  });
});

describe("note des miettes", () => {
  it("dit combien de lignes le seuil a retirées, et lequel", () => {
    /* Sans elle, les parts ne totalisent plus cent pour cent sans qu'on sache
       pourquoi, et la différence passe pour une erreur de mesure. */
    render(<CrumbNote count={2} />);

    expect(screen.getByText(`2 sous ${SHOWN_MIN_MS / MIN} min, non listées.`)).toBeTruthy();
  });

  it("reste muette quand rien n'a été retiré", () => {
    const { container } = render(<CrumbNote count={0} />);

    expect(container).toBeEmptyDOMElement();
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
