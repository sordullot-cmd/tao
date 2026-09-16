/**
 * La page Communication, montée pour de vrai.
 *
 * Ce qui est sous test ici, c'est ce que la page PROMET : une séance qu'on peut
 * faire sans rien ouvrir d'autre, un carnet de preuves qui se remplit en une
 * phrase, et un vocabulaire qui ne se déclare jamais acquis tout seul. Le reste
 * (composition de la séance, séries, niveaux) est vérifié sur le domaine, qui
 * est pur — cf. tests/communication.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

/* Le magasin nuage, remplacé par un magasin de test qui RELAIE entre ses
   instances comme le vrai hook : la page en monte une seule aujourd'hui, mais
   un mock à état purement local ferait diverger deux composants le jour où on
   en ajoutera un — et ferait passer pour cassé ce qui marche. */
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

import CommunicationPage from "@/components/pages/CommunicationPage";

beforeEach(() => { cloudStore.clear(); });
afterEach(cleanup);

const onglet = (nom: string) => fireEvent.click(screen.getByRole("checkbox", { name: nom }));

describe("la séance du jour", () => {
  it("sert trois exercices, consigne comprise — rien à ouvrir pour savoir quoi faire", () => {
    render(<CommunicationPage />);
    expect(screen.getByText("La séance du jour")).toBeTruthy();
    expect(screen.getByText("Instrument")).toBeTruthy();
    expect(screen.getByText("Atelier")).toBeTruthy();
    expect(screen.getByText("Terrain")).toBeTruthy();
    // Le terrain du débutant est le carnet de preuves : c'est le seul exercice
    // qui se passe dehors, et le seul qui fasse vraiment progresser.
    expect(screen.getByText(/Note une interaction qui s'est bien passée/)).toBeTruthy();
  });

  it("garde un exercice coché, et laisse le décocher", () => {
    render(<CommunicationPage />);
    const cases = screen.getAllByRole("checkbox", { name: /à faire$/ });
    expect(cases.length).toBeGreaterThan(0);
    fireEvent.click(cases[0]);
    expect(screen.getAllByRole("checkbox", { name: /fait aujourd'hui$/ }).length).toBe(1);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /fait aujourd'hui$/ })[0]);
    expect(screen.queryAllByRole("checkbox", { name: /fait aujourd'hui$/ }).length).toBe(0);
  });

  it("montre aussi les exercices au-dessus du niveau — le chemin se voit, il ne se devine pas", () => {
    render(<CommunicationPage />);
    expect(screen.getByText("Tous les exercices")).toBeTruthy();
    expect(screen.getByText("Les quatre relances")).toBeTruthy();
    expect(screen.getByText("L'histoire en cinq temps")).toBeTruthy();
  });
});

describe("la chaîne", () => {
  it("reste sans diagnostic tant qu'on ne s'est pas noté", () => {
    /* Annoncer « fragile » sur un maillon qu'on n'a jamais regardé serait un
       diagnostic inventé — et c'est exactement ce que la page refuse de faire. */
    render(<CommunicationPage />);
    expect(screen.getByRole("button", { name: "Poser le diagnostic" })).toBeTruthy();
    expect(screen.getByText("Je ne sais pas quoi dire.")).toBeTruthy();
  });

  it("colore la chaîne une fois la semaine notée", () => {
    render(<CommunicationPage />);
    fireEvent.click(screen.getByRole("button", { name: "Poser le diagnostic" }));
    const dialogue = screen.getByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Débit"), { target: { value: "2" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    // Le maillon « Débit » porte maintenant sa note, et le bouton a changé de mot.
    expect(screen.getByRole("button", { name: "Noter la semaine" })).toBeTruthy();
    expect(screen.getByTitle(/Je me dépêche\. — 2\/10/)).toBeTruthy();
  });
});

describe("le carnet de preuves", () => {
  it("prend une preuve en une phrase et la compte", () => {
    render(<CommunicationPage />);
    onglet("Preuves");
    fireEvent.change(screen.getByLabelText("Nouvelle preuve"), {
      target: { value: "Je suis entré dans la conversation avec « vous parliez de quoi ? »" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Ajouter/ }));
    expect(screen.getByText(/vous parliez de quoi/)).toBeTruthy();
    // Le compteur d'en-tête : c'est lui, le moteur de la page.
    expect(screen.getByText("preuves").previousSibling?.textContent).toBe("1");
  });

  it("refuse d'ajouter une preuve vide", () => {
    render(<CommunicationPage />);
    onglet("Preuves");
    expect(screen.getByRole("button", { name: /Ajouter/ })).toBeDisabled();
  });
});

describe("le vocabulaire", () => {
  it("n'accorde un mot qu'une fois placé dans une vraie conversation", () => {
    render(<CommunicationPage />);
    onglet("Vocabulaire");
    fireEvent.click(screen.getByRole("button", { name: /Un mot/ }));

    const dialogue = screen.getByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Le mot"), { target: { value: "ambigu" } });
    fireEvent.change(within(dialogue).getByLabelText("Définition"), {
      target: { value: "qui se comprend de plusieurs manières" },
    });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));

    expect(screen.getByText("ambigu")).toBeTruthy();
    // Appris n'est pas acquis : 0 sur 1 tant qu'il n'a pas servi.
    expect(screen.getByText("0 sur 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /ambigu — pas encore utilisé/ }));
    expect(screen.getByText("1 sur 1")).toBeTruthy();
  });
});
