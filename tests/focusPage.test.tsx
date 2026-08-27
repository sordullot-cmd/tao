import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* La page Focus tient tout son état dans une clé de `useCloudState`.
   Le remplaçant RELAIE entre ses instances, comme le vrai hook : la page et la
   sentinelle appellent chacune le leur, et une session lancée d'un côté doit
   être vue de l'autre. Un mock à état purement local les laisserait diverger —
   et ferait passer pour cassé ce qui marche. */
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

/* Les notifications natives ne sont pas le sujet ici, et jsdom n'a pas
   l'API Notification. */
vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
  ensureNotifyPermission: vi.fn(async () => true),
  // La page tourne ici en NAVIGATEUR : le garde natif doit rester en retrait,
  // et c'est la couche web seule que ces cas mettent à l'épreuve.
  isTauri: () => false,
}));

import FocusPage from "@/components/pages/FocusPage";
import FocusSentinel from "@/components/focus/FocusSentinel";

/* En production, la page et la sentinelle sont montées ensemble — la première
   dans la zone de contenu, la seconde dans la coquille. Les monter séparément
   ici testerait une combinaison qui n'existe pas : c'est la sentinelle qui tient
   le blocage, la page qui le donne à voir. */
function Focus() {
  return <><FocusSentinel /><FocusPage /></>;
}
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
    render(<Focus />);

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
    render(<Focus />);
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
    render(<Focus />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);

    clickLink("https://arxiv.org/abs/1234");

    expect(screen.queryByText(/est coupé/)).toBeNull();
  });

  it("exige la phrase pour quitter une session en mode profond", () => {
    render(<Focus />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);

    fireEvent.click(screen.getByText("Arrêter"));
    const stop = screen.getByText("Arrêter maintenant") as HTMLButtonElement;
    expect(stop.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(EXIT_PHRASE), { target: { value: "non" } });
    expect((screen.getByText("Arrêter maintenant") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText(EXIT_PHRASE), { target: { value: EXIT_PHRASE } });
    expect((screen.getByText("Arrêter maintenant") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByText("Arrêter maintenant"));

    /* Retour au lancement, sans bandeau de compte rendu : ce qui vient de se
       passer se lit au Bilan, pas en travers de l'écran suivant. Le repère est
       donc le retour des presets. */
    expect(screen.getAllByText("Démarrer").length).toBeGreaterThan(0);
    expect(screen.queryByText("restant")).toBeNull();
  });

  /* Le « Démarrer » de la session LIBRE — celui de la carte qui porte le
     sélecteur de fermeté. Les presets et les programmes en ont un aussi. */
  const freeStart = () => {
    // On remonte depuis l'étiquette « Fermeté » jusqu'au premier ancêtre qui
    // contienne un bouton « Démarrer » : c'est la carte de la session libre.
    let el: HTMLElement | null = screen.getByText("Fermeté");
    while (el) {
      const btn = [...el.querySelectorAll("button")].find(b => /Démarrer/.test(b.textContent || ""));
      if (btn) return btn as HTMLButtonElement;
      el = el.parentElement;
    }
    throw new Error("bouton « Démarrer » de la session libre introuvable");
  };

  it("ne laisse aucune sortie à une session verrouillée", () => {
    render(<Focus />);
    // Session libre → cran « Verrouillé ».
    fireEvent.click(screen.getByText(/durée, listes et fermeté/));
    fireEvent.click(screen.getByText("Verrouillé"));
    fireEvent.click(freeStart());

    /* Le verrou se confirme AVANT de partir : ce qui n'a plus de sortie doit se
       décider en connaissance de cause. (Le titre de la modale vit dans son
       `aria-label`, pas dans un nœud de texte.) */
    expect(screen.getByRole("dialog", { name: "Verrouiller cette session ?" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Je verrouille"));

    // Une fois lancée : ni arrêt, ni pause.
    expect(screen.getByText(/Verrouillée jusqu’au bout/)).toBeInTheDocument();
    expect(screen.queryByText("Arrêter")).toBeNull();
    expect(screen.queryByText("Arrêter maintenant")).toBeNull();
    const pause = screen.getByText(/Pause/).closest("button") as HTMLButtonElement;
    expect(pause.disabled).toBe(true);
  });

  it("laisse revenir sans lancer quand on refuse le verrou", () => {
    render(<Focus />);
    fireEvent.click(screen.getByText(/durée, listes et fermeté/));
    fireEvent.click(screen.getByText("Verrouillé"));
    fireEvent.click(freeStart());
    fireEvent.click(screen.getByText("Revenir"));
    expect(screen.queryByText("restant")).toBeNull();
  });

  it("garde une session en cours d'un rendu à l'autre", () => {
    const first = render(<Focus />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);
    first.unmount();

    // Nouveau montage : la session vit dans le magasin, pas dans l'écran.
    render(<Focus />);
    expect(screen.getByText("Profond")).toBeTruthy();
    expect(screen.getByText("restant")).toBeTruthy();
  });

  it("laisse circuler dans les autres onglets pendant une session", () => {
    /* Une session en cours n'accapare plus la page : le blocage tient pendant
       qu'on retouche une liste, et rien n'oblige à l'arrêter pour aller voir
       ailleurs. */
    render(<Focus />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);
    expect(screen.getByText("restant")).toBeTruthy();

    fireEvent.click(screen.getByText("Listes"));
    expect(screen.getByText("Listes de blocage")).toBeTruthy();

    // La session n'a pas bougé : on la retrouve telle quelle en revenant.
    fireEvent.click(screen.getByText("Session"));
    expect(screen.getByText("restant")).toBeTruthy();
  });

  it("tient le blocage même quand la page Focus n'est pas affichée", () => {
    /* C'est tout l'objet de la sentinelle : un engagement pris pour la journée
       ne s'arrête pas parce qu'on est allé voir ses trades. On lance la session
       depuis la page, puis on la démonte — la coquille, elle, reste. */
    const page = render(<Focus />);
    fireEvent.click(screen.getAllByText("Démarrer")[0]);
    page.unmount();

    render(<FocusSentinel />);
    clickLink("https://www.instagram.com/reels");
    expect(screen.getByText("Instagram est coupé")).toBeTruthy();
  });

  it("coupe un site en permanence, sans qu'aucune session ne tourne", () => {
    /* Le cœur du blocage permanent : aucune session, aucun minuteur, et
       pourtant la coupure tient. On marque une liste puis on démonte la page —
       seule la sentinelle reste, comme dans la coquille. */
    const page = render(<Focus />);
    fireEvent.click(screen.getByText("Listes"));
    // La première carte est « Réseaux sociaux », celle qui couvre Instagram.
    // Le crayon a remplacé le compte de cibles dans le coin de la carte : plus
    // de libellé, on le vise donc par son nom accessible.
    fireEvent.click(screen.getByLabelText("Modifier Réseaux sociaux"));
    fireEvent.click(screen.getByText("Bloquer en permanence"));
    fireEvent.click(screen.getByText("Enregistrer"));
    page.unmount();

    render(<FocusSentinel />);
    clickLink("https://www.instagram.com/reels");
    expect(screen.getByText("Instagram est coupé")).toBeTruthy();
    // Pas de session : l'écran le dit au lieu d'annoncer un temps restant.
    expect(screen.getByRole("dialog").textContent).toContain("Blocage permanent");
  });

  it("rend une liste permanente d'un seul clic depuis sa carte", () => {
    /* La case existe dans l'éditeur, mais on ne va pas ouvrir un éditeur pour
       couper un site pour de bon : le repère de la carte EST l'interrupteur. */
    render(<Focus />);
    fireEvent.click(screen.getByText("Listes"));
    fireEvent.click(screen.getAllByText("Rendre permanent")[0]);

    expect(screen.getAllByText("Permanent").length).toBeGreaterThan(0);

    // Et ça coupe tout de suite, sans session ni rien à relancer.
    clickLink("https://www.instagram.com/reels");
    expect(screen.getByText("Instagram est coupé")).toBeTruthy();
  });

  it("garde les programmes dans l'onglet Session, avec ou sans session", () => {
    /* Lancer maintenant et lancer à neuf heures sont la même intention à deux
       moments : elles se décident au même endroit. Et pendant une session, on
       peut encore planifier la semaine sans interrompre l'heure en cours. */
    render(<Focus />);
    expect(screen.getByText("Programmes")).toBeTruthy();

    fireEvent.click(screen.getAllByText("Démarrer")[0]);
    expect(screen.getByText("Programmes")).toBeTruthy();
  });

  it("n'a plus ni onglet Réglages ni écran de sortie d'app", () => {
    render(<Focus />);
    expect(screen.queryByText("Réglages")).toBeNull();

    // L'objectif quotidien, lui, n'a pas disparu : il a suivi les chiffres
    // qu'il gouverne.
    fireEvent.click(screen.getByText("Bilan"));
    expect(screen.queryByText("Objectif quotidien")).not.toBeNull();
  });

  it("compose une liste et la retrouve dans l'onglet Listes", () => {
    render(<Focus />);
    fireEvent.click(screen.getByText("Listes"));

    expect(screen.getByText("Réseaux sociaux")).toBeTruthy();
    expect(screen.getByText("Cours & paris")).toBeTruthy();
    // Chaque carte porte son crayon, en icône seule dans le coin.
    expect(screen.getByLabelText("Modifier Cours & paris")).toBeTruthy();
  });
});
