import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* Les trois pages « Activité » lisent le même journal local. Ce test les monte
   pour de vrai : une page de mesure qui plante au rendu ne se voit qu'à
   l'exécution, et l'app de bureau n'est pas testable ici. */

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) }, from: () => ({}) }),
}));
vi.mock("@/lib/auth/supabaseAuthProvider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => {
    const [v, set] = React.useState(d);
    return [v, set, true];
  },
}));
// Pas de capteur natif dans jsdom : la boucle d'échantillonnage ne doit pas
// démarrer, sinon les tests attendent des relevés qui n'arriveront jamais.
vi.mock("@/lib/activity/native", () => ({
  hasNativeTracking: () => false,
  snapshot: async () => ({ app: "", title: "", idleSeconds: 0, ok: false, full: false, platform: "test", error: null }),
}));

import ActivityPage from "@/components/pages/ActivityPage";
import ActivityReportsPage from "@/components/pages/ActivityReportsPage";
import ActivityRulesPage from "@/components/pages/ActivityRulesPage";
import { getLocalDateString } from "@/lib/dateUtils";
import { saveDay } from "@/lib/activity/engine";

const today = getLocalDateString();

function seedToday() {
  const base = new Date();
  base.setHours(9, 0, 0, 0);
  const at = (min: number) => base.getTime() + min * 60_000;
  saveDay({
    date: today,
    awayMs: 0,
    updatedAt: Date.now(),
    segments: [
      { s: at(0), e: at(75), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
      { s: at(75), e: at(95), app: "Chrome", label: "Youtube", title: "Lofi - YouTube", cat: "fun" },
      { s: at(95), e: at(140), app: "Code", label: "VS Code", title: "stats.ts", cat: "dev" },
    ],
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("page Activité (journée)", () => {
  it("annonce qu'il n'y a rien à montrer sur une journée vide", () => {
    render(<ActivityPage setPage={vi.fn()} />);
    expect(screen.getByText(/Rien de mesuré ce jour-là/i)).toBeInTheDocument();
  });

  it("affiche les mesures de la journée quand elle a été mesurée", () => {
    seedToday();
    render(<ActivityPage setPage={vi.fn()} />);
    expect(screen.getAllByText("Temps actif").length).toBeGreaterThan(0);
    // 75 + 20 + 45 = 2 h 20 mesurées.
    expect(screen.getAllByText("2 h 20").length).toBeGreaterThan(0);
    // Les deux plages de code font deux sessions de focus (20 min de YouTube au
    // milieu, soit plus que l'interruption tolérée) — la phrase de tête et la
    // mesure le disent toutes les deux.
    expect(screen.getAllByText(/2 sessions/).length).toBeGreaterThan(0);
  });

  it("range une application depuis sa ligne, sans passer par les règles", () => {
    const base = new Date();
    base.setHours(10, 0, 0, 0);
    saveDay({
      date: today, awayMs: 0, updatedAt: Date.now(),
      segments: [{ s: base.getTime(), e: base.getTime() + 40 * 60_000, app: "BidulePro", label: "BidulePro", title: "", cat: "other" }],
    });
    render(<ActivityPage setPage={vi.fn()} />);
    fireEvent.click(screen.getByText("Applications"));
    // La ligne porte sa catégorie, et cette pastille est le bouton qui la change.
    fireEvent.click(screen.getByRole("button", { name: /Catégorie : Non classé/ }));
    fireEvent.click(screen.getByRole("button", { name: "Jeux" }));
    expect(screen.getByRole("button", { name: /Catégorie : Jeux/ })).toBeInTheDocument();
  });

  it("ouvre le détail d'un pavé au clic et liste ce qui y a été ouvert", () => {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const at = (min: number) => base.getTime() + min * 60_000;
    saveDay({
      date: today, awayMs: 0, updatedAt: Date.now(),
      segments: [
        { s: at(0), e: at(40), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
        { s: at(40), e: at(60), app: "Chrome", label: "GitHub", title: "PR · github.com/tr4de", cat: "dev" },
      ],
    });
    render(<ActivityPage setPage={vi.fn()} />);
    // Un seul pavé : les deux segments sont de la même matière, sans trou.
    // L'infobulle du pavé est la seule à détailler ce qu'il contient.
    fireEvent.click(screen.getByTitle(/VS Code 40 min/));
    expect(screen.getByText("2 applications")).toBeInTheDocument();
    expect(screen.getByText("VS Code")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
    // La fenêtre vue est nommée : c'est elle qui dit ce qu'on faisait.
    expect(screen.getByText(/engine\.ts/)).toBeInTheDocument();
    // Et on revient au résumé.
    fireEvent.click(screen.getByRole("button", { name: /Revenir au résumé/ }));
    expect(screen.getAllByText("Temps actif").length).toBeGreaterThan(0);
  });

  it("referme la sélection d'un pavé avec Échap", () => {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const at = (min: number) => base.getTime() + min * 60_000;
    saveDay({
      date: today, awayMs: 0, updatedAt: Date.now(),
      segments: [{ s: at(0), e: at(40), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" }],
    });
    render(<ActivityPage setPage={vi.fn()} />);
    fireEvent.click(screen.getByTitle(/VS Code 40 min/));
    expect(screen.getByText(/1 application/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    // Le résumé a repris la place du détail.
    expect(screen.getAllByText("Temps actif").length).toBeGreaterThan(0);
  });

  it("navigue vers les rapports depuis les onglets", () => {
    const setPage = vi.fn();
    render(<ActivityPage setPage={setPage} />);
    fireEvent.click(screen.getByText("Rapports"));
    expect(setPage).toHaveBeenCalledWith("activity-reports");
  });
});

describe("page Rapports", () => {
  it("invite à revenir quand l'historique est vide", () => {
    render(<ActivityReportsPage setPage={vi.fn()} />);
    expect(screen.getByText(/Pas encore d'historique/i)).toBeInTheDocument();
  });

  it("agrège la période mesurée", () => {
    seedToday();
    render(<ActivityReportsPage setPage={vi.fn()} />);
    expect(screen.getByText("Jour par jour")).toBeInTheDocument();
    expect(screen.getByText(/1 jour sur 7/)).toBeInTheDocument();
  });
});

describe("page Catégories & règles", () => {
  it("ajoute une règle de classement", () => {
    render(<ActivityRulesPage setPage={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Fragment cherché/i);
    fireEvent.change(input, { target: { value: "Blender" } });
    fireEvent.click(screen.getByText("Ajouter"));
    expect(screen.getByText("1 règle")).toBeInTheDocument();
    // Le fragment est normalisé en minuscules : la comparaison l'est aussi.
    expect((screen.getByDisplayValue("blender") as HTMLInputElement)).toBeInTheDocument();
  });

  it("propose de classer les applications inconnues", () => {
    const base = new Date();
    base.setHours(14, 0, 0, 0);
    saveDay({
      date: today, awayMs: 0, updatedAt: Date.now(),
      segments: [{ s: base.getTime(), e: base.getTime() + 30 * 60_000, app: "BidulePro", label: "BidulePro", title: "", cat: "other" }],
    });
    render(<ActivityRulesPage setPage={vi.fn()} />);
    expect(screen.getByText("BidulePro")).toBeInTheDocument();
    expect(screen.getByText("1 à classer")).toBeInTheDocument();
  });
});
