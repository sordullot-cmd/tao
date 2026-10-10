import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* Page « Éloquence » — la structure de la refonte.
   Trois onglets au lieu de six, les quatre repères affichés en permanence, et les
   exercices à répétition (occlusives, virelangues) qui comptent sans passer par
   l'IA. Ce test fige cette ossature, pas la mise en forme. */

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

// Pas de Supabase Storage dans un test : la réécoute cloud n'est pas le sujet.
vi.mock("@/lib/hooks/useEloquenceAudio", () => ({
  useEloquenceAudio: () => ({ uploadAudio: async () => null, getAudioUrl: async () => null }),
}));

import EloquencePage from "@/components/pages/EloquencePage";

const tab = (name: string) => screen.getByRole("button", { name });

describe("Page Éloquence", () => {
  beforeEach(() => cloudStore.clear());

  it("n'expose que trois exercices, et affiche les quatre repères en permanence", () => {
    render(<EloquencePage />);

    expect(tab("Articulation")).toBeInTheDocument();
    expect(tab("Lecture")).toBeInTheDocument();
    expect(tab("Parole")).toBeInTheDocument();
    // Les onglets supprimés ne doivent plus exister nulle part.
    expect(screen.queryByRole("button", { name: "Sujets" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Défis" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Diction" })).toBeNull();

    expect(screen.getByText("Vise 110–130 mots/minute.")).toBeInTheDocument();
    expect(screen.getByText("Mets de vrais silences.")).toBeInTheDocument();
    expect(screen.getByText("Coupe les bruits parasites.")).toBeInTheDocument();
    expect(screen.getByText("Finis tes phrases en descendant.")).toBeInTheDocument();
  });

  it("compte les vingt répétitions d'une occlusive, et boucle la série", () => {
    render(<EloquencePage />);

    const counter = screen.getByRole("button", { name: /Consonne T — compter une répétition \(0 sur 20\)/ });
    expect(screen.getByText("T — TA · TE · TI · TO · TU")).toBeInTheDocument();
    expect(screen.getByText("0 / 4 consonnes bouclées aujourd'hui")).toBeInTheDocument();

    for (let i = 0; i < 20; i++) fireEvent.click(counter);

    expect(screen.getByText("Série bouclée")).toBeInTheDocument();
    expect(screen.getByText("1 / 4 consonnes bouclées aujourd'hui")).toBeInTheDocument();
    // Au-delà de vingt, le compteur ne bouge plus.
    fireEvent.click(counter);
    expect(screen.getByRole("button", { name: /Consonne T — compter une répétition \(20 sur 20\)/ })).toBeInTheDocument();
  });

  it("ouvre les virelangues sur le niveau expert, sans « Tous »", () => {
    render(<EloquencePage />);

    // Un seul niveau à la fois : le catalogue s'ouvre sur l'expert, et les
    // virelangues faciles ne sont pas listés tant qu'on ne descend pas.
    expect(screen.getByText("Si six scies scient six cyprès, six cent six scies scient six cent six cyprès.")).toBeInTheDocument();
    expect(screen.queryByText("Un chasseur sachant chasser sait chasser sans son chien.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tous" })).toBeNull();

    fireEvent.click(tab("Facile"));
    expect(screen.getByText("Un chasseur sachant chasser sait chasser sans son chien.")).toBeInTheDocument();
  });

  it("propose le protocole en deux séries de dix sur un virelangue", () => {
    render(<EloquencePage />);

    fireEvent.click(screen.getByText("Si six scies scient six cyprès, six cent six scies scient six cent six cyprès."));
    expect(tab("10 fois en accélérant")).toBeInTheDocument();
    expect(tab("10 fois en articulant à fond")).toBeInTheDocument();
    // Chaque série a son propre compteur, remis à zéro en changeant de série.
    expect(screen.getByRole("button", { name: /Vitesse — compter une répétition \(0 sur 10\)/ })).toBeInTheDocument();
    // Le catalogue reste affiché : on change de virelangue en tapant un autre.
    expect(screen.getByRole("button", { name: "Expert" })).toBeInTheDocument();
    expect(screen.getByText("Ces six saucisses-ci sont si sèches qu'on ne sait si c'en sont.")).toBeInTheDocument();
  });

  it("ouvre la lecture sur la lente et exagérée, avec sa cible de débit propre", () => {
    render(<EloquencePage />);
    fireEvent.click(tab("Lecture"));

    expect(screen.getByText("Deux fois trop lent, deux fois trop articulé.")).toBeInTheDocument();
    expect(screen.getByText(/Débit cible de cet exercice : 70–100 mots\/minute/)).toBeInTheDocument();
    // L'imitation, elle, réclame le texte du modèle plutôt qu'un texte maison.
    fireEvent.click(screen.getByText("Rejoue ton orateur préféré, mot pour mot."));
    expect(screen.getByText("Le texte de ton modèle")).toBeInTheDocument();
  });

  it("garde l'enregistrement de la parole fermé jusqu'à ce qu'un sujet soit posé", () => {
    render(<EloquencePage />);
    fireEvent.click(tab("Parole"));

    expect(screen.getByText("Choisis ou écris un sujet pour débloquer l'enregistrement.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Écris ton sujet/), {
      target: { value: "Faut-il toujours dire la vérité ?" },
    });
    expect(screen.queryByText("Choisis ou écris un sujet pour débloquer l'enregistrement.")).toBeNull();
  });

  it("bascule le format « mot interdit » avec sa liste de tics à bannir", () => {
    render(<EloquencePage />);
    fireEvent.click(tab("Parole"));
    fireEvent.click(screen.getByText("Bannis un tic de langage."));

    expect(screen.getByText("Mot interdit :")).toBeInTheDocument();
    expect(tab("du coup")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/mot à bannir/)).toBeInTheDocument();
  });
});
