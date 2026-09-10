import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* Comme la page Focus, la page Sport tient tout son état dans `useCloudState`.
   Le remplaçant RELAIE entre instances : le plan, les séances et les modèles
   sont trois clés lues par des composants différents, et un mock purement
   local les laisserait diverger. */
const cloudStore = new Map<string, unknown>();
const cloudListeners = new Map<string, Set<() => void>>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => {
      const set = cloudListeners.get(k) ?? new Set<() => void>();
      set.add(force);
      cloudListeners.set(k, set);
      return () => { set.delete(force); };
    }, [k, force]);

    const read = () => (cloudStore.has(k) ? cloudStore.get(k) : d);
    const set = (u: unknown) => {
      cloudStore.set(k, typeof u === "function" ? (u as (p: unknown) => unknown)(read()) : u);
      cloudListeners.get(k)?.forEach(fn => fn());
    };
    return [read(), set, true];
  },
}));

import SportPage from "@/components/pages/SportPage";

/** Lundi de la semaine en cours, au format ISO — le plan s'ouvre dessus. */
function mondayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() || 7) - 1) + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Le menu « Ajouter » de la colonne du lundi. */
function openMondayMenu() {
  fireEvent.click(screen.getByLabelText(/Ajouter une séance au plan · lun/));
}

/** Le bouton « Ajouter » de la colonne du lundi, puis le choix dans son menu. */
function planOnMonday(choice: string) {
  openMondayMenu();
  fireEvent.click(screen.getByText(choice));
}

/** Le champ d'un formulaire, repéré par ce qu'il contient déjà. */
function type(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

const PRESET = {
  id: "p1", name: "Push A", discipline: "musculation",
  exercises: [{ name: "Développé couché", category: "push" }],
};

/* Le plan ouvre l'onglet « Entraînement », qui est celui d'arrivée : rien à
   cliquer pour l'atteindre. */
function openPlan() {
  render(<SportPage />);
}

describe("Plan de la semaine (Sport)", () => {
  beforeEach(() => {
    cloudStore.clear();
    cloudStore.set("tr4de_sport_custom_presets", [PRESET]);
  });

  it("ouvre sept jours au repos tant que rien n'est posé", () => {
    openPlan();
    expect(screen.getAllByText("Repos")).toHaveLength(7);
  });

  it("pose un modèle sur un jour, et le redonne la semaine suivante", () => {
    openPlan();
    planOnMonday("Push A");

    expect(screen.getByText("Push A")).toBeTruthy();
    expect(screen.getAllByText("Repos")).toHaveLength(6);

    // Le plan est une routine, pas un rendez-vous : il se répète.
    fireEvent.click(screen.getByLabelText("Semaine suivante"));
    expect(screen.getByText("Push A")).toBeTruthy();
  });

  it("coche la ligne prévue dès qu'une séance de la même discipline existe ce jour-là", () => {
    cloudStore.set("tr4de_sport_sessions", [
      { id: 1, date: mondayISO(), discipline: "musculation", duration: 60, exercises: [] },
    ]);
    openPlan();
    planOnMonday("Push A");

    expect(screen.getByTitle("Ouvrir la séance").textContent).toContain("Push A");
    expect(screen.getByText("1 / 1 faite")).toBeTruthy();
  });

  it("ne coche pas une séance d'une autre discipline, et la montre quand même", () => {
    cloudStore.set("tr4de_sport_sessions", [
      { id: 1, date: mondayISO(), discipline: "cardio", duration: 30, exercises: [] },
    ]);
    openPlan();
    planOnMonday("Push A");

    expect(screen.getByTitle("Démarrer cette séance").textContent).toContain("Push A");
    expect(screen.getByText("0 / 1 faite")).toBeTruthy();
    // La séance faite hors programme reste visible : le jour n'était pas vide.
    expect(screen.getByTitle("Séance hors plan")).toBeTruthy();
  });

  it("démarre la séance prévue avec les exercices du modèle déjà en place", () => {
    openPlan();
    planOnMonday("Push A");
    fireEvent.click(screen.getByTitle("Démarrer cette séance"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByDisplayValue("Développé couché")).toBeTruthy();
  });

  it("modifie un modèle, et le plan qui s'en sert suit", () => {
    openPlan();
    planOnMonday("Push A");

    openMondayMenu();
    fireEvent.click(screen.getByLabelText("Modifier le modèle Push A"));

    const editor = screen.getByRole("dialog", { name: "Modifier le modèle" });
    type(within(editor).getByDisplayValue("Push A"), "Push B");
    fireEvent.click(within(editor).getByText("Enregistrer"));

    // La ligne posée AVANT l'édition porte le nouveau nom : elle suit son
    // modèle au lieu d'en garder une copie figée.
    expect(screen.getByText("Push B")).toBeTruthy();
    expect(screen.queryByText("Push A")).toBeNull();
  });

  it("garde la ligne du plan quand son modèle est supprimé", () => {
    openPlan();
    planOnMonday("Push A");

    openMondayMenu();
    fireEvent.click(screen.getByLabelText("Modifier le modèle Push A"));
    fireEvent.click(screen.getByLabelText("Supprimer le modèle"));

    // Le repli tient : une ligne qui se viderait serait pire qu'une ligne figée.
    expect(screen.getByText("Push A")).toBeTruthy();
  });

  it("crée un modèle depuis le plan", () => {
    openPlan();
    openMondayMenu();
    fireEvent.click(screen.getByText("Nouveau modèle"));

    const editor = screen.getByRole("dialog", { name: "Nouveau modèle" });
    type(within(editor).getByPlaceholderText(/Push A/), "Jambes");
    fireEvent.click(within(editor).getByText("Ajouter un exercice"));
    type(within(editor).getByPlaceholderText(/Rechercher un exercice/), "Squat");
    fireEvent.click(within(editor).getByText("Enregistrer"));

    openMondayMenu();
    expect(screen.getByText("Jambes")).toBeTruthy();
  });

  it("retire une ligne du plan", () => {
    openPlan();
    planOnMonday("Push A");

    // La croix n'apparaît qu'au survol de la ligne : c'est la ligne qui la porte.
    fireEvent.mouseEnter(screen.getByTitle("Démarrer cette séance").parentElement!);
    fireEvent.click(screen.getByLabelText("Retirer du plan"));

    expect(screen.queryByText("Push A")).toBeNull();
    expect(screen.getAllByText("Repos")).toHaveLength(7);
  });
});
