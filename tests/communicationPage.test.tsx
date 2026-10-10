/**
 * La page Communication, montée pour de vrai.
 *
 * Ce qui est sous test ici, c'est ce que la page PROMET : une séance qu'on peut
 * faire sans rien ouvrir d'autre, une mission qui se vérifie le lendemain et
 * pas le soir même, un débrief qui accepte des chiffres, et un vocabulaire qui
 * ne se déclare jamais acquis tout seul. Le reste (composition de la séance,
 * séries, renforts, bilans) est vérifié sur le domaine, qui est pur — cf.
 * tests/communication.test.ts.
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
import { COMM_KEY } from "@/lib/communication";

beforeEach(() => { cloudStore.clear(); });
afterEach(cleanup);

const onglet = (nom: string | RegExp) => fireEvent.click(screen.getByRole("checkbox", { name: nom }));
const hier = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

describe("la séance du jour", () => {
  it("sert les cinq temps, consigne comprise — rien à ouvrir pour savoir quoi faire", () => {
    render(<CommunicationPage />);
    expect(screen.getByText("La séance du jour")).toBeTruthy();
    for (const temps of [/Échauffement/, /Compétence du jour/, /Simulation/, /Débrief/, /Mission réelle/]) {
      expect(screen.getByText(temps), String(temps)).toBeTruthy();
    }
  });

  it("garde un exercice coché, et laisse le décocher", () => {
    render(<CommunicationPage />);
    const cases = screen.getAllByRole("checkbox", { name: /à faire$/ });
    expect(cases.length).toBeGreaterThanOrEqual(5);
    fireEvent.click(cases[0]);
    expect(screen.getAllByRole("checkbox", { name: /fait aujourd’hui$/ }).length).toBe(1);
    fireEvent.click(screen.getAllByRole("checkbox", { name: /fait aujourd’hui$/ })[0]);
    expect(screen.queryAllByRole("checkbox", { name: /fait aujourd’hui$/ }).length).toBe(0);
  });

  it("montre aussi les exercices des phases suivantes — le chemin se voit, il ne se devine pas", () => {
    render(<CommunicationPage />);
    expect(screen.getByText("Tous les exercices")).toBeTruthy();
    expect(screen.getByText("L'histoire en cinq temps")).toBeTruthy();
    expect(screen.getByText("Le levier du jour")).toBeTruthy();
  });
});

describe("la mission réelle", () => {
  it("demande le lendemain si elle a eu lieu, jamais le jour même", () => {
    /* Une mission cochée une minute après se l'être donnée ne prouve rien.
       C'est tout l'intérêt du report. */
    cloudStore.set(COMM_KEY, {
      phase: 1,
      missions: [{ id: "m1", date: hier(), texte: "Entrer une fois dans une conversation", phase: 1, statut: "en cours" }],
    });
    render(<CommunicationPage />);
    expect(screen.getByText("Entrer une fois dans une conversation")).toBeTruthy();
    expect(screen.getByText("Tu l’as fait ?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Oui/ }));
    expect(screen.queryByText("Tu l’as fait ?")).toBeNull();
  });
});

describe("le débrief", () => {
  it("accepte des chiffres et se marque fait", () => {
    render(<CommunicationPage />);
    fireEvent.click(screen.getByRole("button", { name: /Ouvrir le débrief/ }));
    const dialogue = screen.getByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Béquilles"), { target: { value: "11" } });
    fireEvent.change(within(dialogue).getByLabelText("Débit"), { target: { value: "4" } });
    fireEvent.click(within(dialogue).getByRole("checkbox", { name: "J'ai accéléré" }));
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));

    expect(screen.getAllByRole("checkbox", { name: /fait aujourd’hui$/ }).length).toBe(1);
    onglet("Progression");
    expect(screen.getByText("J'ai accéléré")).toBeTruthy();
  });
});

describe("les carnets", () => {
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
    expect(screen.getByText("0 sur 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /ambigu — pas encore utilisé/ }));
    expect(screen.getByText("1 sur 1")).toBeTruthy();
  });
});

describe("la progression", () => {
  it("garde la chaîne sans diagnostic tant qu'on ne s'est pas noté", () => {
    /* Annoncer « fragile » sur un maillon qu'on n'a jamais regardé serait un
       diagnostic inventé — et c'est exactement ce que la page refuse de faire. */
    render(<CommunicationPage />);
    onglet("Progression");
    expect(screen.getByText("Je ne sais pas quelle branche prendre.")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(5);
  });

  it("colore la chaîne une fois la semaine notée", () => {
    render(<CommunicationPage />);
    onglet("Progression");
    fireEvent.click(screen.getByRole("button", { name: "Noter la semaine" }));
    const dialogue = screen.getByRole("dialog");
    fireEvent.change(within(dialogue).getByLabelText("Contrôle du débit"), { target: { value: "2" } });
    fireEvent.click(within(dialogue).getByRole("button", { name: "Enregistrer" }));
    expect(screen.getByTitle(/Je me dépêche\. — 2\/10/)).toBeTruthy();
  });
});

describe("l’année", () => {
  it("ne compte aucune semaine tant que le parcours n'a pas de premier jour", () => {
    render(<CommunicationPage />);
    onglet(/année/);
    expect(screen.getByText(/n’a pas encore de premier jour/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Je commence aujourd’hui/ }));
    expect(screen.getByText("Semaine 1")).toBeTruthy();
  });

  it("garde le cap et le laisse reformuler", () => {
    render(<CommunicationPage />);
    onglet(/année/);
    const champ = screen.getByLabelText("Le cap de l’année") as HTMLInputElement;
    expect(champ.value.length).toBeGreaterThan(10);
    fireEvent.change(champ, { target: { value: "Tenir une conversation de vingt minutes" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect((screen.getByLabelText("Le cap de l’année") as HTMLInputElement).value)
      .toBe("Tenir une conversation de vingt minutes");
  });
});
