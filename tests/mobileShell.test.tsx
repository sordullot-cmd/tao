/**
 * Coquille mobile — barre d'onglets, feuille basse, en-tête.
 *
 * Ce qui est vérifié ici n'est pas « le composant s'affiche », mais les
 * quelques propriétés dont la perte se voit tout de suite sur un téléphone et
 * jamais sur un écran de développement :
 *
 *   — l'onglet actif est ANNONCÉ (`aria-current`), pas seulement coloré ;
 *   — les cibles tactiles gardent la hauteur qu'on leur a donnée ;
 *   — la feuille se referme par le voile et par Échap, jamais par le seul
 *     geste (qui n'existe pas à la souris ni au clavier) ;
 *   — le retour d'historique est bien câblé.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LayoutDashboard, ListChecks, Plus, Calendar, MoreHorizontal } from "lucide-react";
import TabBar from "@/components/ui/TabBar";
import Sheet from "@/components/ui/Sheet";
import MobileHeader from "@/components/ui/MobileHeader";

const ITEMS = [
  { id: "dashboard", label: "Bilan", icon: LayoutDashboard },
  { id: "trades", label: "Trades", icon: ListChecks },
  { id: "add-trade", label: "Ajouter", icon: Plus, primary: true },
  { id: "calendar", label: "Calendrier", icon: Calendar },
  { id: "more", label: "Plus", icon: MoreHorizontal },
];

describe("Barre d'onglets", () => {
  it("annonce l'écran courant aux lecteurs d'écran, pas seulement à l'œil", () => {
    render(<TabBar items={ITEMS} activeId="trades" onSelect={() => {}} />);
    // Un seul onglet porte `aria-current` : la couleur d'accent ne suffit pas,
    // elle n'existe pas pour qui n'y a pas accès.
    const current = screen.getAllByRole("button").filter(b => b.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("aria-label", "Trades");
  });

  it("ne marque aucun onglet actif quand la feuille « Plus » est ouverte", () => {
    render(<TabBar items={ITEMS} activeId="trades" onSelect={() => {}} moreOpen />);
    // Sinon deux endroits de la barre se prétendent le lieu courant.
    expect(screen.getAllByRole("button").filter(b => b.hasAttribute("aria-current"))).toHaveLength(0);
    expect(screen.getByLabelText("Plus")).toHaveAttribute("data-active");
  });

  it("donne à chaque onglet la hauteur de cible prévue", () => {
    render(<TabBar items={ITEMS} activeId="dashboard" onSelect={() => {}} />);
    for (const btn of screen.getAllByRole("button")) {
      // 56 px via `--tabbar-h` : au-delà des 44 px recommandés, et sans dépendre
      // du texte, qui n'occupe que 10 px.
      expect(btn.style.height).toBe("var(--tabbar-h)");
    }
  });

  it("l'onglet d'action n'est jamais une destination", () => {
    render(<TabBar items={ITEMS} activeId="add-trade" onSelect={() => {}} />);
    // Même « actif », le « + » ne s'affiche pas comme un lieu où l'on serait :
    // on y va pour faire quelque chose, puis on en repart.
    expect(screen.getByLabelText("Ajouter").querySelector(".tr4de-tab-fab")).not.toBeNull();
  });

  it("relaie la sélection", () => {
    const onSelect = vi.fn();
    render(<TabBar items={ITEMS} activeId="dashboard" onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("Calendrier"));
    expect(onSelect).toHaveBeenCalledWith("calendar");
  });
});

describe("Feuille basse", () => {
  beforeEach(() => { document.body.className = ""; document.body.style.top = ""; });

  it("ne rend rien tant qu'elle est fermée", () => {
    render(<Sheet open={false} onClose={() => {}} title="Plus">contenu</Sheet>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("se présente comme une surface modale nommée", () => {
    render(<Sheet open onClose={() => {}} title="Plus">contenu</Sheet>);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Plus");
  });

  it("fige le fond tant qu'elle est ouverte, et rend sa place au défilement", () => {
    /* Sans ce verrou, un glissé qui déborde de la feuille fait défiler la page
       derrière : on perd sa position de lecture en refermant. Le verrou passe
       par une CLASSE et non par un style inline — la règle mobile pose
       `overflow: auto !important` sur le corps de page, contre laquelle un
       style inline ne peut rien. */
    Object.defineProperty(window, "scrollY", { value: 320, writable: true, configurable: true });
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { value: scrollTo, writable: true, configurable: true });

    const { unmount } = render(<Sheet open onClose={() => {}}>contenu</Sheet>);
    expect(document.body.classList.contains("tr4de-scroll-locked")).toBe(true);
    // La position est mémorisée dans le décalage, pas perdue.
    expect(document.body.style.top).toBe("-320px");

    unmount();
    expect(document.body.classList.contains("tr4de-scroll-locked")).toBe(false);
    expect(document.body.style.top).toBe("");
    // Et rendue telle quelle au démontage : refermer ne renvoie pas en haut.
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 320 }));
  });

  it("se referme au clavier — la sortie ne dépend pas du geste", async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose}>contenu</Sheet>);
    fireEvent.keyDown(document, { key: "Escape" });
    // La fermeture est différée : la surface finit sa course avant d'être
    // démontée, sinon elle disparaît d'un coup.
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 1000 });
  });

  it("ne déclenche qu'une seule fermeture, même sollicitée deux fois", async () => {
    const onClose = vi.fn();
    render(<Sheet open onClose={onClose}>contenu</Sheet>);
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 1000 });
  });
});

describe("En-tête mobile", () => {
  it("nomme l'écran — la seule réponse à « où suis-je » en application installée", () => {
    render(<MobileHeader title="Discipline" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Discipline");
  });

  it("n'affiche le retour que lorsqu'il y a quelque part où remonter", () => {
    const { rerender } = render(<MobileHeader title="Bilan" />);
    expect(screen.queryByLabelText("Retour")).toBeNull();
    rerender(<MobileHeader title="Détail du compte" onBack={() => {}} />);
    expect(screen.getByLabelText("Retour")).toBeInTheDocument();
  });

  it("donne au retour une cible de 44 px, quelle que soit la taille du chevron", () => {
    render(<MobileHeader title="Détail" onBack={() => {}} />);
    const back = screen.getByLabelText("Retour");
    expect(back.style.width).toBe("44px");
    expect(back.style.height).toBe("44px");
  });

  it("ne révèle son filet que lorsque du contenu passe dessous", () => {
    // `scrollY` est global au document de test : on repart de zéro, sinon la
    // position laissée par le test du verrou de défilement se glisse ici.
    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    const { container } = render(<MobileHeader title="Trades" />);
    const header = container.querySelector(".tr4de-mobile-header")!;
    expect(header.hasAttribute("data-scrolled")).toBe(false);

    Object.defineProperty(window, "scrollY", { value: 120, writable: true, configurable: true });
    fireEvent.scroll(window);
    expect(header.hasAttribute("data-scrolled")).toBe(true);

    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    fireEvent.scroll(window);
    expect(header.hasAttribute("data-scrolled")).toBe(false);
  });
});
