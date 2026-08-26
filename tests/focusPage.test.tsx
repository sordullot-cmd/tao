import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* La page Focus tient tout son état dans une clé de `useCloudState` : on la
   remplace par un état React local, comme les autres tests de page. */
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

/* Les notifications natives ne sont pas le sujet ici, et jsdom n'a pas
   l'API Notification. */
vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
  ensureNotifyPermission: vi.fn(async () => true),
}));

import FocusPage from "@/components/pages/FocusPage";
import { EXIT_PHRASE } from "@/lib/focus/model";

/** Lien externe posé dans le document, comme n'importe quel lien de l'app. */
function clickLink(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = href;
  document.body.appendChild(a);
  fireEvent.click(a);
  a.remove();
}

describe("Page Focus", () => {
  beforeEach(() => cloudStore.clear());

  it("propose les presets d'origine et lance une session", () => {
    render(<FocusPage />);

    expect(screen.getByText("Deep work")).toBeTruthy();
    expect(screen.getByText("Pomodoro")).toBeTruthy();

    // Le premier preset est « Deep work » : 90 min, mode profond.
    fireEvent.click(screen.getAllByText("Démarrer")[0]);

    // L'écran de session remplace le lancement, et annonce sa fermeté.
    expect(screen.getByText("Profond")).toBeTruthy();
    expect(screen.getByText("restant")).toBeTruthy();
    expect(screen.queryByText("Pomodoro")).toBeNull();
  });

  it("intercepte un lien coupé, le compte, et laisse revenir au focus", () => {
    render(<FocusPage />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);

    clickLink("https://www.instagram.com/reels");

    expect(screen.getByText("Instagram est coupé")).toBeTruthy();
    // L'écran de blocage nomme la liste responsable — sinon on ne sait pas quoi
    // desserrer si le blocage était de trop.
    expect(screen.getByRole("dialog").textContent).toContain("Réseaux sociaux");

    fireEvent.click(screen.getByText("Revenir au focus"));
    expect(screen.queryByText("Instagram est coupé")).toBeNull();

    // La tentative est comptée sur la session : c'est ce que lit le bilan.
    expect(screen.getByText("Blocages").parentElement?.textContent).toContain("1");
  });

  it("laisse passer ce qu'aucune liste ne retient", () => {
    render(<FocusPage />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);

    clickLink("https://arxiv.org/abs/1234");

    expect(screen.queryByText(/est coupé/)).toBeNull();
  });

  it("exige la phrase pour quitter une session en mode profond", () => {
    render(<FocusPage />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);

    fireEvent.click(screen.getByText("Arrêter"));
    const stop = screen.getByText("Arrêter maintenant") as HTMLButtonElement;
    expect(stop.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(EXIT_PHRASE), { target: { value: "non" } });
    expect((screen.getByText("Arrêter maintenant") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(EXIT_PHRASE), { target: { value: EXIT_PHRASE } });
    expect((screen.getByText("Arrêter maintenant") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByText("Arrêter maintenant"));

    // Retour au lancement, avec le compte rendu de ce qui vient de se passer.
    expect(screen.getByText("Session interrompue")).toBeTruthy();
    expect(screen.getByText("Deep work")).toBeTruthy();
  });

  it("garde une session en cours d'un rendu à l'autre", () => {
    const first = render(<FocusPage />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);
    first.unmount();

    // Nouveau montage : la session vit dans le magasin, pas dans l'écran.
    render(<FocusPage />);
    expect(screen.getByText("Profond")).toBeTruthy();
    expect(screen.getByText("restant")).toBeTruthy();
  });

  it("compose une liste et la retrouve dans l'onglet Listes", () => {
    render(<FocusPage />);
    fireEvent.click(screen.getByText("Listes"));

    expect(screen.getByText("Réseaux sociaux")).toBeTruthy();
    expect(screen.getByText("Cours & paris")).toBeTruthy();
    // Les listes d'origine annoncent leur nombre de cibles.
    expect(screen.getAllByText("Modifier").length).toBeGreaterThan(0);
  });
});
