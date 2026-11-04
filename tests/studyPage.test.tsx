import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";

/* Le remplaçant de `useCloudState` RELAIE entre ses instances, comme le vrai
   hook : sans ce relais, deux composants montés sur la même clé divergent. */
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
vi.mock("@/lib/contexts/UndoContext", () => ({ useUndo: () => ({ pushUndo: vi.fn() }) }));
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/hooks/useTradeScreenshots", () => ({ useTradeScreenshots: () => ({ urls: {} }) }));
vi.mock("@/lib/hooks/useTradeNotes", () => ({ useTradeNotes: () => ({ notes: { "1": "Un contrat, 1R." } }) }));
vi.mock("@/lib/hooks/useTradeStrategyLinks", () => ({ useTradeStrategyLinks: () => ({ "1": ["s1"] }) }));

import StudyPage from "@/components/pages/StudyPage";
import type { StudyStore } from "@/lib/study/model";

const TRADES = [
  { id: 1, symbol: "NQ", direction: "long", date: "2026-10-12", pnl: 250 },
  { id: 2, symbol: "ES", direction: "short", date: "2026-10-14", pnl: -80 },
];

const study = () => cloudStore.get("tao_study") as StudyStore;

/* Deux boutons « Ajouter » dans la note (vidéos, captures) : on soumet le
   formulaire du champ lui-même. */
function submitMedia() {
  fireEvent.submit(screen.getByLabelText("Ajouter une vidéo ou un lien").closest("form")!);
}

function newBlankNote() {
  fireEvent.click(screen.getByRole("button", { name: /Nouvelle note/ }));
}

describe("Page Étude", () => {
  beforeEach(() => {
    cloudStore.clear();
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("hors ligne"))));
  });

  it("ouvre sur l'accueil, sans note récente", () => {
    render(<StudyPage trades={TRADES} />);
    expect(screen.getByText("Récents")).toBeTruthy();
    expect(screen.getByText(/Aucune note pour l'instant/)).toBeTruthy();
  });

  it("crée un dossier depuis les onglets, le nomme sur place et y range une note", () => {
    render(<StudyPage trades={TRADES} />);
    fireEvent.click(screen.getByRole("button", { name: "Nouveau dossier" }));
    fireEvent.change(screen.getByLabelText("Nom du dossier"), { target: { value: "Liquidité" } });
    expect(study().folders.map(f => f.name)).toEqual(["Liquidité"]);

    fireEvent.click(screen.getByRole("button", { name: /Nouvelle note dans Liquidité/ }));
    fireEvent.change(screen.getByLabelText("Titre de la note"), { target: { value: "Prise de liquidité" } });

    const [note] = study().notes;
    expect(note.title).toBe("Prise de liquidité");
    expect(note.folderId).toBe(study().folders[0].id);
    /* Le fil d'Ariane situe la note dans son dossier. */
    const crumbs = screen.getByRole("navigation", { name: "Fil d'Ariane" });
    expect(within(crumbs).getByText("Liquidité")).toBeTruthy();
  });

  it("démarre une note depuis un lien YouTube collé sur l'accueil", () => {
    render(<StudyPage trades={TRADES} />);
    fireEvent.change(screen.getByLabelText("Lien de la vidéo YouTube"), { target: { value: "https://youtu.be/dQw4w9WgXcQ?t=95" } });
    fireEvent.submit(screen.getByLabelText("Lien de la vidéo YouTube").closest("form")!);

    const [note] = study().notes;
    expect(note.videos).toMatchObject([{ youtubeId: "dQw4w9WgXcQ", start: 95, position: 0 }]);
    /* Rien ne part chez YouTube avant le clic : une vignette, pas d'iframe. */
    expect(screen.getByRole("button", { name: "Lire la vidéo" })).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("propose de reprendre là où l'on s'était arrêté", () => {
    cloudStore.set("tao_study", {
      folders: [], sessions: [], running: null,
      notes: [{ id: "n", title: "Judas swing", content: "", videos: [{ id: "v", youtubeId: "dQw4w9WgXcQ", start: 0, title: "", position: 222 }] }],
    });
    render(<StudyPage trades={TRADES} />);
    fireEvent.click(screen.getByText("Judas swing"));
    expect(screen.getByRole("button", { name: "Reprendre à 3:42" })).toBeTruthy();
  });

  it("passe le trade à côté de la vidéo et l'y retient, sans le prix d'entrée et de sortie", () => {
    cloudStore.set("tao_study", {
      folders: [], sessions: [], running: null,
      notes: [{ id: "n", title: "Judas swing", content: "", tradeIds: ["1"], videos: [{ id: "v", youtubeId: "dQw4w9WgXcQ", start: 0, title: "", position: 0 }] }],
    });
    render(<StudyPage trades={[{ ...TRADES[0], entry: 21000, exit: 21050 }]} />);
    fireEvent.click(screen.getByText("Judas swing"));
    expect(screen.queryByText("De l'entrée à la sortie")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mettre le trade à côté de la vidéo" }));
    expect(JSON.parse(localStorage.getItem("tao_study_player") || "{}").tradePlace).toBe("side");
    fireEvent.click(screen.getByRole("button", { name: "Mettre le trade sous la vidéo" }));
    expect(JSON.parse(localStorage.getItem("tao_study_player") || "{}").tradePlace).toBe("below");
  });

  it("retient la disposition du lecteur sur l'appareil", () => {
    render(<StudyPage trades={TRADES} />);
    fireEvent.change(screen.getByLabelText("Lien de la vidéo YouTube"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.submit(screen.getByLabelText("Lien de la vidéo YouTube").closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Côté" }));
    expect(JSON.parse(localStorage.getItem("tao_study_player") || "{}").mode).toBe("side");
    fireEvent.click(screen.getByRole("button", { name: "Haut" }));
  });

  it("refuse sur l'accueil un lien qui n'est pas YouTube", () => {
    render(<StudyPage trades={TRADES} />);
    fireEvent.change(screen.getByLabelText("Lien de la vidéo YouTube"), { target: { value: "https://tradingview.com" } });
    fireEvent.submit(screen.getByLabelText("Lien de la vidéo YouTube").closest("form")!);
    expect(screen.getByRole("alert").textContent).toMatch(/pas un lien YouTube/);
    expect(study()?.notes ?? []).toEqual([]);
  });

  it("démarre une note depuis un trade du journal", () => {
    render(<StudyPage trades={TRADES} />);
    fireEvent.click(screen.getByRole("button", { name: /Mon trade/ }));
    fireEvent.click(screen.getByRole("button", { name: /Quel trade veux-tu comprendre/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /NQ/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Relier 1 trade" }));

    const [note] = study().notes;
    expect(note.tradeIds).toEqual(["1"]);
    expect(note.title).toMatch(/^NQ — /);
  });

  it("range dans une note une adresse quelconque comme lien, et refuse un texte", () => {
    render(<StudyPage trades={TRADES} />);
    newBlankNote();
    const field = screen.getByLabelText("Ajouter une vidéo ou un lien");
    fireEvent.change(field, { target: { value: "revoir le FVG" } });
    submitMedia();
    expect(screen.getByRole("alert").textContent).toMatch(/Colle une adresse/);

    fireEvent.change(field, { target: { value: "tradingview.com/chart" } });
    submitMedia();
    expect(study().notes[0].links).toMatchObject([{ url: "https://tradingview.com/chart", label: "tradingview.com" }]);
  });

  it("relie des trades à une note et en relit le bilan", () => {
    render(<StudyPage trades={TRADES} />);
    newBlankNote();
    fireEvent.click(screen.getByRole("button", { name: /Mon trade/ }));
    fireEvent.click(screen.getByRole("button", { name: /Relier des trades de ton journal/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /NQ/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /ES/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Relier 2 trades" }));

    expect(study().notes[0].tradeIds.sort()).toEqual(["1", "2"]);
    expect(screen.getByText(/2 trades · 50 % gagnants/)).toBeTruthy();
    /* Le premier trade a sa carte : ce qu'on en a écrit dans le journal, et
       le chart (absent ici). */
    expect(screen.getByText("Un contrat, 1R.")).toBeTruthy();
    expect(screen.getByText("Pas de chart sur ce trade.")).toBeTruthy();
  });

  it("range les notes sans dossier dans « Feuilles volantes »", () => {
    render(<StudyPage trades={TRADES} />);
    newBlankNote();
    fireEvent.change(screen.getByLabelText("Titre de la note"), { target: { value: "Idée en vrac" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Feuilles volantes" })[0]);
    expect(screen.getByRole("heading", { name: "Feuilles volantes" })).toBeTruthy();
    expect(screen.getByText("Idée en vrac")).toBeTruthy();
  });

  it("range une note en la glissant sur l'onglet d'un dossier", () => {
    render(<StudyPage trades={TRADES} />);
    newBlankNote();
    fireEvent.change(screen.getByLabelText("Titre de la note"), { target: { value: "À ranger" } });
    fireEvent.click(screen.getByRole("button", { name: "Nouveau dossier" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Feuilles volantes" })[0]);

    /* jsdom n'a pas de DataTransfer : un objet minimal suffit au code. */
    const data = new Map<string, string>();
    const dataTransfer = {
      get types() { return [...data.keys()]; },
      setData: (k: string, v: string) => { data.set(k, v); },
      getData: (k: string) => data.get(k) ?? "",
      effectAllowed: "", dropEffect: "",
    };
    const row = screen.getByText("À ranger").closest('[role="button"]')!;
    const target = screen.getAllByRole("button", { name: "Sans titre" })[0].parentElement!;
    fireEvent.dragStart(row, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    const s = study();
    expect(s.notes[0].folderId).toBe(s.folders[0].id);
    expect(screen.queryByText("À ranger")).toBeNull();
  });

  it("revient de la note au dossier par la flèche de retour", () => {
    render(<StudyPage trades={TRADES} />);
    fireEvent.click(screen.getByRole("button", { name: "Nouveau dossier" }));
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle note dans/ }));
    expect(screen.getByLabelText("Titre de la note")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(screen.getByLabelText("Nom du dossier")).toBeTruthy();
  });

  it("clôt une séance restée ouverte, faute de bouton pour l'arrêter", () => {
    cloudStore.set("tao_study", { version: 1, folders: [], notes: [], sessions: [], running: new Date(Date.now() - 10 * 60000).toISOString() });
    render(<StudyPage trades={TRADES} />);
    expect(screen.queryByRole("button", { name: /Fermer la porte/ })).toBeNull();
    expect(study().running).toBeNull();
    expect(study().sessions.length).toBe(1);
  });
});
