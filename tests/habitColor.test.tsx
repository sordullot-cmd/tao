import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* La couleur d'une habitude se choisit à la main, mais reste facultative :
   sans choix, elle continue de venir de la carte « Vie RPG » rattachée. Ce
   test monte la page pour vérifier les deux versants — le choix est retenu, et
   « Auto » le rend à la couleur dérivée. */

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }),
}));
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/contexts/UndoContext", () => ({ useUndo: () => ({ pushUndo: () => {} }) }));
/* Le magasin doit relayer entre instances qui partagent une clé : la page lit
   habitudes, objectifs et cartes par des hooks distincts. */
vi.mock("@/lib/hooks/useCloudState", () => {
  const store = new Map<string, unknown>();
  const subs = new Map<string, Set<(v: unknown) => void>>();
  return {
    useCloudState: (key: string, _c: string, d: unknown) => {
      const [v, set] = React.useState(() => (store.has(key) ? store.get(key) : d));
      React.useEffect(() => {
        const s = subs.get(key) || new Set();
        s.add(set); subs.set(key, s);
        return () => { s.delete(set); };
      }, [key]);
      const write = (next: unknown) => {
        const cur = store.has(key) ? store.get(key) : d;
        const val = typeof next === "function" ? (next as (p: unknown) => unknown)(cur) : next;
        store.set(key, val);
        for (const fn of subs.get(key) || []) fn(val);
      };
      return [v, write, true];
    },
  };
});

import DailyPlannerPage from "@/components/pages/DailyPlannerPage";
import { CATEGORY_PALETTE } from "@/lib/lifeRpgCategories";
import { T } from "@/lib/ui/tokens";

// Vignette d'icône de la ligne : premier bloc de la rangée, teinté par la
// couleur de l'habitude.
const vignetteOf = (name: string) => {
  const row = screen.getByText(name).closest("[draggable]") as HTMLElement;
  return row.querySelector("div") as HTMLElement;
};

/* jsdom normalise les hex en rgb() : on compare des couleurs résolues, pas
   des chaînes d'auteur. */
const asColor = (c: string) => {
  const d = document.createElement("div");
  d.style.color = c;
  return d.style.color;
};

const openForm = (name: string) => {
  const row = screen.getByText(name).closest("[draggable]") as HTMLElement;
  fireEvent.click(within(row).getByLabelText(`Modifier ${name}`));
};

beforeEach(() => {
  localStorage.clear();
});

describe("couleur d'une habitude", () => {
  it("retient la couleur choisie et la pose sur la vignette", () => {
    render(<DailyPlannerPage />);
    const chosen = CATEGORY_PALETTE[2];
    expect(vignetteOf("Lecture").style.color).not.toBe(asColor(chosen));

    openForm("Lecture");
    fireEvent.click(screen.getByLabelText(`Couleur ${chosen}`));
    fireEvent.click(screen.getByText("Enregistrer"));

    expect(vignetteOf("Lecture").style.color).toBe(asColor(chosen));
  });

  it("remplit la vignette de cette couleur une fois l'habitude cochée", () => {
    render(<DailyPlannerPage />);
    const chosen = CATEGORY_PALETTE[4];
    openForm("Lecture");
    fireEvent.click(screen.getByLabelText(`Couleur ${chosen}`));
    fireEvent.click(screen.getByText("Enregistrer"));

    fireEvent.click(screen.getByRole("checkbox", { name: /Lecture — à faire/ }));

    // Cocher ne doit rien éteindre : le disque prend la couleur PLEINE, et le
    // nom garde son encre normale (seul le barré dit que c'est fait).
    const dot = vignetteOf("Lecture");
    expect(dot.style.background).toBe(asColor(chosen));
    expect(screen.getByText("Lecture").style.color).toBe(asColor(T.text));
    expect(screen.getByText("Lecture").style.textDecoration).toBe("line-through");
  });

  it("rend l'habitude à sa couleur automatique quand on repasse sur « Auto »", () => {
    render(<DailyPlannerPage />);
    const auto = vignetteOf("Journaling").style.color;
    const chosen = CATEGORY_PALETTE.find(c => asColor(c) !== auto)!;

    openForm("Journaling");
    fireEvent.click(screen.getByLabelText(`Couleur ${chosen}`));
    fireEvent.click(screen.getByText("Enregistrer"));
    expect(vignetteOf("Journaling").style.color).toBe(asColor(chosen));

    openForm("Journaling");
    fireEvent.click(screen.getByLabelText("Couleur automatique"));
    fireEvent.click(screen.getByText("Enregistrer"));
    expect(vignetteOf("Journaling").style.color).toBe(auto);
  });
});
