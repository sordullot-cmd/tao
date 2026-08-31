import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

/* La tuile d'une étape est la pièce qu'on regarde le plus longtemps sur une
   carte, et son état ne se déduit d'aucune donnée nue — il naît de la
   combinaison mesure / franchi / retard. Ces cas la montent seule : la page
   entière tire un magasin nuage et le journal d'activité, dont rien ici ne
   dépend. */
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => [d, () => {}, true],
}));

import { StepRow, StepsBlock } from "@/components/pages/LifeRpgPage";

const CAT = { id: "sante", label: "Santé", color: "#4C6FFF" };
const TODAY = "2026-06-01";

const step = (id: string, label: string, done = false, due: string | null = null) =>
  ({ id, label, done, due, doneAt: done ? "2026-01-01T00:00:00.000Z" : null });

afterEach(cleanup);

/* ── La tuile d'une étape ─────────────────────────────────────────────────── */

const goal = (id: string, label: string, pct: number) =>
  ({ id, label, pct, rawPct: pct, current: pct, target: 100, unit: "", color: "#4C6FFF", pctOnly: true });

describe("tuile d'une étape", () => {
  const props = { cat: CAT, allObjectives: [], onToggle: () => {}, onRename: () => {}, onDelete: null };

  it("porte l'avancement du jalon au bout de sa ligne", () => {
    /* Il n'existait nulle part : il fallait additionner de tête les barres des
       objectifs rattachés, une fois la ligne dépliée. */
    render(
      <StepRow {...props} step={step("a", "Courir 10 km")} status="upcoming"
        goals={[goal("g1", "Km courus", 40), goal("g2", "Séances", 80)]} />,
    );
    expect(screen.getByText("60 %")).toBeTruthy();
  });

  it("replie les objectifs et dit combien il y en a", () => {
    render(
      <StepRow {...props} step={step("a", "Courir 10 km")} status="upcoming"
        goals={[goal("g1", "Km courus", 40), goal("g2", "Séances", 80)]} />,
    );
    // Repliée, la tuile ne montre pas le détail : elle dit le total et le compte.
    expect(screen.queryByText("Km courus")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Voir les objectifs/ }));
    expect(screen.getByText("Km courus")).toBeTruthy();
    expect(screen.getByText("Séances")).toBeTruthy();
  });

  it("garde le bouton d'ajout visible tant qu'aucun objectif ne la mesure", () => {
    /* Sans objectif, il n'y a rien à déplier — et cacher l'ajout derrière un
       dépliage supprimerait le seul chemin pour en rattacher un. Réduit au
       « + » : le mot « Objectif » prenait, sur la ligne, une largeur volée au
       libellé du jalon. Le sens reste porté par le nom accessible. */
    render(<StepRow {...props} step={step("a", "Marathon")} status="upcoming" goals={[]} onToggleObjective={() => {}} />);
    expect(screen.getByRole("button", { name: "Rattacher un objectif à l'étape Marathon" })).toBeTruthy();
    expect(screen.queryByText("Objectif")).toBeNull();
    expect(screen.queryByRole("button", { name: /Voir les objectifs/ })).toBeNull();
  });

  it("ne pose une barre de pied que sur un jalon mesuré et non franchi", () => {
    /* Sans objectif rattaché, elle n'aurait que 0 ou 100 à montrer — c'est-à-dire
       ce que la pastille dit déjà. */
    const bars = (el: HTMLElement) => el.querySelectorAll("div[style*='height: 3px']").length;
    const mesure = render(<StepRow {...props} step={step("a", "Courir")} status="upcoming" goals={[goal("g", "Km", 60)]} />);
    expect(bars(mesure.container)).toBe(1);
    cleanup();
    const nue = render(<StepRow {...props} step={step("b", "Marathon")} status="upcoming" goals={[]} />);
    expect(bars(nue.container)).toBe(0);
    cleanup();
    const finie = render(<StepRow {...props} step={step("c", "Semi")} status="done" goals={[goal("g", "Km", 100)]} />);
    expect(bars(finie.container)).toBe(0);
  });
});

/* ── Le raccord entre deux tuiles ─────────────────────────────────────────── */

describe("chaîne des étapes", () => {
  it("relie les tuiles deux à deux, et s'arrête à la dernière", () => {
    /* Sans raccord, des tuiles séparées par du vide se lisent comme une liste de
       choses indépendantes — or un jalon n'a de sens que par sa place dans un
       parcours. Un trait après la dernière laisserait croire à une suite. */
    const { container } = render(
      <StepsBlock cat={CAT} steps={[step("a", "A", true), step("b", "B"), step("c", "C")]}
        today={TODAY} onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
    const links = container.querySelectorAll("div[aria-hidden='true'][style*='width: 1.5px']");
    expect(links.length).toBe(2);
  });

  it("colore le raccord qui suit une étape franchie, pas les autres", () => {
    // La couleur dit le chemin PARCOURU, comme sur la pastille qui le précède.
    const { container } = render(
      <StepsBlock cat={CAT} steps={[step("a", "A", true), step("b", "B"), step("c", "C")]}
        today={TODAY} onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
    const links = [...container.querySelectorAll("div[aria-hidden='true'][style*='width: 1.5px']")];
    expect((links[0] as HTMLElement).style.background).toBe("rgb(76, 111, 255)");
    expect((links[1] as HTMLElement).style.background).not.toBe("rgb(76, 111, 255)");
  });
});

/* ── Poser un jalon ───────────────────────────────────────────────────────── */

describe("ajout d'une étape", () => {
  const open = (onAdd: (l: string) => void) => {
    render(
      <StepsBlock cat={CAT} steps={[step("a", "A")]} today={TODAY} onAdd={onAdd}
        onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
  };

  it("ne montre qu'un emplacement tant qu'on n'écrit pas", () => {
    /* Le champ de saisie occupait la place d'une étape en permanence, alors
       qu'on en pose trois dans l'année. */
    open(() => {});
    expect(screen.getByRole("button", { name: "Ajouter une étape" })).toBeTruthy();
    expect(screen.queryByPlaceholderText("Nouvelle étape…")).toBeNull();
  });

  it("s'ouvre en champ au clic, et pose le jalon à Entrée", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));

    const field = screen.getByPlaceholderText("Nouvelle étape…");
    fireEvent.change(field, { target: { value: "  Semi-marathon  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(added).toEqual(["Semi-marathon"]);
  });

  it("reste ouvert après un ajout — on en pose rarement un seul", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));

    const field = screen.getByPlaceholderText("Nouvelle étape…");
    fireEvent.change(field, { target: { value: "Semi" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.change(field, { target: { value: "Marathon" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(added).toEqual(["Semi", "Marathon"]);
    expect((field as HTMLInputElement).value).toBe("");
  });

  it("se referme à Échap sans rien poser", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    const field = screen.getByPlaceholderText("Nouvelle étape…");
    fireEvent.change(field, { target: { value: "Oups" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(added).toEqual([]);
    expect(screen.getByRole("button", { name: "Ajouter une étape" })).toBeTruthy();
  });

  it("refuse un libellé vide", () => {
    const added: string[] = [];
    open((l) => added.push(l));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une étape" }));
    fireEvent.keyDown(screen.getByPlaceholderText("Nouvelle étape…"), { key: "Enter" });
    expect(added).toEqual([]);
  });
});

/* ── Ranger les jalons à la main ──────────────────────────────────────────── */

describe("ordre des étapes", () => {
  type Move = [string, string, string];

  const openList = (moves: Move[] | null) => {
    const r = render(
      <StepsBlock cat={CAT} steps={[step("a", "A"), step("b", "B"), step("c", "C")]}
        today={TODAY} onMove={moves ? (...m: Move) => moves.push(m) : undefined}
        onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
    return r;
  };

  /* jsdom ne mesure rien : sans géométrie, les trois tuiles occupent le même
     point et la place d'arrivée — qui se compte en centres dépassés — n'aurait
     aucun sens. Trois tuiles de 36 px espacées de 44. */
  const tiles = (c: HTMLElement) => {
    const list = [...c.querySelectorAll("[data-step-id]")] as HTMLElement[];
    list.forEach((el, i) => {
      el.getBoundingClientRect = () =>
        ({ top: i * 44, bottom: i * 44 + 36 } as unknown as DOMRect);
    });
    return list;
  };

  /* `fireEvent.pointerDown(el, { clientY })` perd la coordonnée : jsdom ne
     connaît pas `PointerEvent`, l'événement retombe sur `Event` et son
     constructeur ignore tout ce qui vient d'un pointeur. Or c'est l'ordonnée
     seule qui dit où le jalon tombe. */
  const pointer = (type: string, clientY: number) =>
    new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });

  /** Attrape `el` et le traîne jusqu'à `to`, comme la souris le ferait. */
  const dragTo = (el: HTMLElement, from: number, to: number) => {
    fireEvent(el, pointer("pointerdown", from));
    fireEvent(window, pointer("pointermove", to));
    fireEvent(window, pointer("pointerup", to));
  };

  it("dépose le jalon avant celui qu'on remonte au-dessus", () => {
    const moves: Move[] = [];
    const { container } = openList(moves);
    const [, , c] = tiles(container);
    dragTo(c, 106, 4);
    expect(moves).toEqual([["c", "a", "before"]]);
  });

  it("le dépose après celui qu'on descend en dessous", () => {
    const moves: Move[] = [];
    const { container } = openList(moves);
    const [a] = tiles(container);
    dragTo(a, 18, 110);
    expect(moves).toEqual([["a", "c", "after"]]);
  });

  it("ne le sort pas de la liste, si loin qu'on tire", () => {
    /* On déplace un jalon DANS le chemin : lâché cent pixels sous la dernière
       tuile, il se range en dernier, il ne part pas ailleurs. */
    const moves: Move[] = [];
    const { container } = openList(moves);
    const [a] = tiles(container);
    fireEvent(a, pointer("pointerdown", 18));
    fireEvent(window, pointer("pointermove", 400));
    expect(a.style.transform).toBe("translateY(88px)"); // borné au bas de la liste
    fireEvent(window, pointer("pointerup", 400));
    expect(moves).toEqual([["a", "c", "after"]]);
  });

  it("ne déplace la tuile que de haut en bas", () => {
    // Une liste de jalons n'a qu'un axe : une tuile qui dérive latéralement
    // quitte la colonne où se lit sa place.
    const { container } = openList([]);
    const [a] = tiles(container);
    fireEvent(a, pointer("pointerdown", 18));
    fireEvent(window, pointer("pointermove", 60));
    expect(a.style.transform).toBe("translateY(42px)");
    expect(a.style.transform).not.toContain("translateX");
  });

  it("laisse le clic renommer quand la souris n'a pas bougé", () => {
    const moves: Move[] = [];
    const { container } = openList(moves);
    const [a] = tiles(container);
    dragTo(a, 18, 20);
    expect(moves).toEqual([]);
    expect(a.style.transform).toBe("none");
  });

  it("ne part pas d'une commande de la tuile", () => {
    /* On ne déplace pas un jalon en tirant sur sa case à cocher : le geste
       partirait au moindre tremblement pendant qu'on le coche. */
    const moves: Move[] = [];
    const { container } = openList(moves);
    tiles(container);
    fireEvent(screen.getByRole("checkbox", { name: /^A —/ }), pointer("pointerdown", 18));
    fireEvent(window, pointer("pointermove", 110));
    fireEvent(window, pointer("pointerup", 110));
    expect(moves).toEqual([]);
  });

  it("déplace aussi au clavier, depuis le libellé", () => {
    /* Le pointeur ne répond ni au clavier ni au doigt — un ordre qu'on ne peut
       poser qu'à la souris n'est pas un ordre pour tout le monde. */
    const moves: Move[] = [];
    openList(moves);
    fireEvent.keyDown(screen.getByText("B"), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(screen.getByText("B"), { key: "ArrowDown", altKey: true });
    expect(moves).toEqual([["b", "a", "before"], ["b", "c", "after"]]);
  });

  it("ne fait rien aux deux bouts, ni sans la touche Alt", () => {
    const moves: Move[] = [];
    openList(moves);
    fireEvent.keyDown(screen.getByText("A"), { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(screen.getByText("C"), { key: "ArrowDown", altKey: true });
    // Les flèches nues appartiennent au défilement de la page.
    fireEvent.keyDown(screen.getByText("B"), { key: "ArrowUp" });
    expect(moves).toEqual([]);
  });

  it("n'annonce aucune prise quand la carte ne sait pas ranger", () => {
    // Le bloc se monte aussi sans écriture possible : rien ne doit alors
    // promettre un geste qui n'aboutirait nulle part.
    const { container } = openList(null);
    const [a] = tiles(container);
    expect(a.style.cursor).toBe("default");
    fireEvent(a, pointer("pointerdown", 18));
    fireEvent(window, pointer("pointermove", 110));
    expect(a.style.transform).toBe("none");
  });
});

/* ── Le pli du bloc se retient ────────────────────────────────────────────── */

describe("mémoire de l'ouverture des étapes", () => {
  it("obéit à la carte quand celle-ci sait retenir le pli", () => {
    /* Ouvrir le chemin d'un objectif, c'est le suivre en ce moment — une
       intention qui ne dure pas le temps d'un écran. Elle se reperdait à chaque
       navigation : trois cartes à rouvrir une par une. */
    const changes: boolean[] = [];
    const { rerender } = render(
      <StepsBlock cat={CAT} steps={[step("a", "A")]} today={TODAY}
        open={false} onOpenChange={(v: boolean) => changes.push(v)}
        onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    // Fermé : la liste n'est pas là.
    expect(screen.queryByText("A")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
    // Le bloc ne s'ouvre pas tout seul : il DEMANDE, la carte décide et retient.
    expect(changes).toEqual([true]);
    expect(screen.queryByText("A")).toBeNull();

    rerender(
      <StepsBlock cat={CAT} steps={[step("a", "A")]} today={TODAY}
        open onOpenChange={(v: boolean) => changes.push(v)}
        onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    expect(screen.getByText("A")).toBeTruthy();
  });

  it("garde un pli à lui quand personne n'écoute", () => {
    /* Le bloc se monte aussi hors de la page — tests, écrans à venir : il doit
       s'ouvrir même sans carte pour retenir son état. */
    render(
      <StepsBlock cat={CAT} steps={[step("a", "A")]} today={TODAY}
        onToggle={() => {}} onRename={() => {}} onDelete={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Étapes/ }));
    expect(screen.getByText("A")).toBeTruthy();
  });
});
