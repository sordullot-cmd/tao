import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* Test de MONTAGE de la page Révisions.
 *
 * Il existe parce que la couche `lib/srs` peut être verte de bout en bout
 * pendant que la page refuse de s'afficher : une icône passée là où un élément
 * est attendu, un composant rendu comme enfant, un `Modal` mal appelé. Ces
 * fautes-là ne se voient qu'en montant l'arbre pour de vrai.
 *
 * Il parcourt donc les cinq onglets et ouvre les fenêtres — pas pour figer une
 * mise en page, mais pour garantir que chaque écran se rend sans exception. */

const cloudStore = new Map<string, unknown>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(() => (cloudStore.has(k) ? cloudStore.get(k) : d));
    const set = (u: unknown) => setV((prev: unknown) => {
      const next = typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u;
      cloudStore.set(k, next);
      return next;
    });
    return [v, set, true];
  },
}));

vi.mock("@/lib/contexts/UndoContext", () => ({
  useUndo: () => ({ pushUndo: vi.fn() }),
}));

import RevisionsPage from "@/components/pages/RevisionsPage";

/** Crée un paquet via la fenêtre dédiée, comme le ferait un utilisateur. */
function createDeck(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /Nouveau paquet/ }));
  fireEvent.change(screen.getByPlaceholderText("Gestion du risque"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Créer" }));
}

describe("Page Révisions — montage", () => {
  beforeEach(() => cloudStore.clear());

  it("s'ouvre sur l'accueil de méthode quand il n'y a aucune carte", () => {
    render(<RevisionsPage />);
    expect(screen.getByText("Réviser au bon moment")).toBeInTheDocument();
  });

  it("rend les trois onglets sans exception", () => {
    render(<RevisionsPage />);
    for (const tab of ["Paquets", "Atelier", "Aujourd'hui"]) {
      fireEvent.click(screen.getByRole("button", { name: tab }));
    }
    // On revient sur « Aujourd'hui » : si un onglet avait explosé, le rendu
    // aurait levé avant d'arriver ici.
    expect(screen.getByText("Réviser au bon moment")).toBeInTheDocument();
  });

  it("crée un paquet, l'ouvre, et revient par le fil d'Ariane", () => {
    render(<RevisionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Paquets" }));
    createDeck("Gestion du risque");

    // La ligne du paquet mène à son contenu.
    fireEvent.click(screen.getByText("Gestion du risque"));
    expect(screen.getByPlaceholderText("Rechercher…")).toBeInTheDocument();

    /* Le retour passe par `BackLink`. C'est précisément ce composant qui a
       cassé la page une fois : il rend sa prop `icon` comme ENFANT, et lui
       passer un composant lucide plutôt qu'un élément fait lever React.

       Deux boutons portent le nom « Paquets » — l'onglet, puis le fil
       d'Ariane. On vise le second, dans l'ordre du document. */
    const backButtons = screen.getAllByRole("button", { name: "Paquets" });
    expect(backButtons).toHaveLength(2);
    fireEvent.click(backButtons[1]);
    expect(screen.getByRole("button", { name: /Nouveau paquet/ })).toBeInTheDocument();
  });

  it("crée une note et la fait apparaître dans son paquet", () => {
    render(<RevisionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Paquets" }));
    createDeck("Trading");

    fireEvent.click(screen.getByRole("button", { name: /Nouvelle note/ }));
    fireEvent.change(screen.getByPlaceholderText("Que mesure la stabilité ?"), {
      target: { value: "Risque par trade" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Le délai au bout duquel il reste 90 % de chances de se souvenir."),
      { target: { value: "1 % du capital" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    fireEvent.click(screen.getByText("Trading"));
    expect(screen.getByText("Risque par trade")).toBeInTheDocument();
  });

  it("compte les cartes d'un texte à trous pendant la saisie", () => {
    render(<RevisionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Paquets" }));
    createDeck("Trading");

    fireEvent.click(screen.getByRole("button", { name: /Nouvelle note/ }));
    // Repéré par sa valeur affichée : le calcul de nom accessible fait cloner
    // le nœud, et jsdom trébuche sur certains styles en ligne de la fenêtre.
    fireEvent.change(screen.getByDisplayValue("Recto / verso"), { target: { value: "cloze" } });
    fireEvent.change(screen.getByPlaceholderText(/On coupe la position/), {
      target: { value: "On coupe à {{c1::-1R}} et on vise {{c2::+2R}}." },
    });
    expect(screen.getByText("2 cartes à réviser")).toBeInTheDocument();
  });

  it("mène une séance de révision jusqu'aux quatre boutons", () => {
    render(<RevisionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Paquets" }));
    createDeck("Trading");
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle note/ }));
    fireEvent.change(screen.getByPlaceholderText("Que mesure la stabilité ?"), {
      target: { value: "Risque par trade" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Le délai au bout duquel il reste 90 % de chances de se souvenir."),
      { target: { value: "1 % du capital" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    fireEvent.click(screen.getByRole("button", { name: "Aujourd'hui" }));
    fireEvent.click(screen.getByRole("button", { name: /Réviser/ }));

    // La question s'affiche seule : la réponse ne doit PAS être visible encore,
    // sans quoi il n'y a plus de rappel actif.
    expect(screen.getByText("Risque par trade")).toBeInTheDocument();
    expect(screen.queryByText("1 % du capital")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Afficher la réponse/ }));
    expect(screen.getByText("1 % du capital")).toBeInTheDocument();

    // Les quatre boutons portent chacun un délai, et ils vont en croissant.
    for (const label of ["À revoir", "Difficile", "Correct", "Facile"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByText("Correct"));
    expect(screen.getByText(/Séance terminée|Revue dans/)).toBeInTheDocument();
  });

  it("n'expose plus les onglets Statistiques et Réglages", () => {
    render(<RevisionsPage />);
    expect(screen.queryByRole("button", { name: "Statistiques" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Réglages" })).toBeNull();
  });

  it("rend l'atelier et invite à créer un paquet quand il n'y en a aucun", () => {
    render(<RevisionsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Atelier" }));
    const shell = screen.getByText("Aucun paquet").parentElement as HTMLElement;
    expect(within(shell).getByRole("button", { name: "Créer un paquet" })).toBeInTheDocument();
  });
});
