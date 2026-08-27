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

  it("laisse hors du détail d'un pavé ce qui a duré moins de quatre minutes", () => {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const at = (min: number) => base.getTime() + min * 60_000;
    saveDay({
      date: today, awayMs: 0, updatedAt: Date.now(),
      segments: [
        { s: at(0), e: at(27), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
        // Deux minutes : effleuré, pas utilisé.
        { s: at(27), e: at(29), app: "Chrome", label: "Twitter", title: "Accueil", cat: "social" },
        { s: at(29), e: at(30), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
      ],
    });
    render(<ActivityPage setPage={vi.fn()} />);
    fireEvent.click(screen.getByTitle(/VS Code 28 min/));
    expect(screen.getByText("VS Code")).toBeInTheDocument();
    expect(screen.queryByText("Twitter")).toBeNull();
    // Rien n'est masqué en silence.
    expect(screen.getByText(/1 sous 4 min/)).toBeInTheDocument();
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

  it("montre le temps d'écran de la semaine et mène au jour cliqué", () => {
    seedToday();
    /* Le lundi de la semaine en cours : toujours dans la grille, et jamais dans
       le futur — le test ne dépend donc pas du jour où il tourne. (Si on EST
       lundi, c'est aujourd'hui, et cette graine-ci remplace celle du dessus.) */
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const mKey = getLocalDateString(monday);
    const at = (h: number) => { const d = new Date(monday); d.setHours(h, 0, 0, 0); return d.getTime(); };
    saveDay({
      date: mKey, awayMs: 0, updatedAt: Date.now(),
      segments: [{ s: at(14), e: at(16), app: "Code", label: "VS Code", title: "lundi.ts", cat: "dev" }],
    });
    render(<ActivityPage setPage={vi.fn()} />);
    expect(screen.getByText("Utilisation quotidienne")).toBeInTheDocument();

    const label = new Date(`${mKey}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    fireEvent.click(screen.getByTitle(`${label} — 2 h 00`));
    // La page a basculé sur cette journée-là : ses deux heures sont en tête.
    expect(screen.getAllByText("2 h 00").length).toBeGreaterThan(0);
  });

  it("recule d'une semaine avec le sélecteur", () => {
    seedToday();
    render(<ActivityPage setPage={vi.fn()} />);
    expect(screen.getByText("Cette semaine")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Semaine précédente"));
    expect(screen.getByText("Semaine dernière")).toBeInTheDocument();
    // Le jour lu a suivi : plus rien de mesuré sept jours plus tôt.
    expect(screen.getByText(/Rien de mesuré ce jour-là/i)).toBeInTheDocument();
  });

  it("mène aux règles quand une page de navigateur n'a pas de nom de site", () => {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const at = (min: number) => base.getTime() + min * 60_000;
    saveDay({
      date: today, awayMs: 0, updatedAt: Date.now(),
      // Titre sans domaine ni séparateur : aucun nom de site n'en sort, la
      // ligne reste sous le nom du navigateur.
      segments: [{ s: at(0), e: at(40), app: "Arc", label: "Arc", title: "Sans titre", cat: "other" }],
    });
    const setPage = vi.fn();
    render(<ActivityPage setPage={setPage} />);
    fireEvent.click(screen.getByRole("button", { name: /Applications/ }));

    // Pas de sélecteur muet : la ligne dit qu'elle est à régler, et y mène.
    const action = screen.getByRole("button", { name: "À régler…" });
    fireEvent.click(action);
    expect(setPage).toHaveBeenCalledWith("activity-rules");
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
    expect(screen.getByText("Régularité")).toBeInTheDocument();
    // Trente jours par défaut : le bloc parle d'habitude, pas de la semaine en
    // cours (celle-là est dans l'onglet « Journée »).
    expect(screen.getByText(/1 jour sur 30/)).toBeInTheDocument();
  });
});

describe("page Catégories & règles", () => {
  it("ajoute une règle de classement", () => {
    render(<ActivityRulesPage setPage={vi.fn()} />);
    // Les règles vivent dans un tiroir : on y vient pour relire ou corriger, la
    // file d'attente les écrit toute seule.
    fireEvent.click(screen.getByText("Mes règles de classement"));
    const input = screen.getByPlaceholderText(/Fragment cherché/i);
    fireEvent.change(input, { target: { value: "Blender" } });
    fireEvent.click(screen.getByText("Ajouter"));
    expect(screen.getByText("1 règle")).toBeInTheDocument();
    // Le fragment est normalisé en minuscules : la comparaison l'est aussi.
    expect((screen.getByDisplayValue("blender") as HTMLInputElement)).toBeInTheDocument();
  });

  it("crée une catégorie, la nomme, et la propose au classement", () => {
    render(<ActivityRulesPage setPage={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Nouvelle catégorie/i), { target: { value: "Musculation" } });
    fireEvent.click(screen.getByText("Créer"));
    expect(screen.getByText("Musculation")).toBeInTheDocument();
    // Elle rejoint le vocabulaire : les règles peuvent y renvoyer.
    fireEvent.click(screen.getByText("Mes règles de classement"));
    const options = screen.getAllByRole("option").map(o => o.textContent);
    expect(options).toContain("Musculation");
  });

  it("renomme une catégorie livrée avec l'app", () => {
    render(<ActivityRulesPage setPage={vi.fn()} />);
    fireEvent.click(screen.getByText("Trading & marchés"));
    const field = screen.getByDisplayValue("Trading & marchés");
    fireEvent.change(field, { target: { value: "Marchés" } });
    fireEvent.blur(field);
    expect(screen.getByText("Marchés")).toBeInTheDocument();
    // Et on peut revenir au nom d'origine.
    fireEvent.click(screen.getByText("Réinitialiser"));
    expect(screen.getByText("Trading & marchés")).toBeInTheDocument();
  });

  it("retire une catégorie livrée et la rétablit", () => {
    render(<ActivityRulesPage setPage={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Supprimer « Jeux »/));
    // La ligne a disparu du vocabulaire…
    expect(screen.queryByLabelText(/Supprimer « Jeux »/)).not.toBeInTheDocument();
    // …mais une livrée est masquée, pas effacée : le catalogue y range des
    // centaines d'applications, il faut pouvoir revenir en arrière.
    expect(screen.getByText(/Retirées/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Jeux"));
    expect(screen.getByLabelText(/Supprimer « Jeux »/)).toBeInTheDocument();
  });

  it("réordonne les catégories au glisser-déposer", () => {
    const { container } = render(<ActivityRulesPage setPage={vi.fn()} />);
    const rows = () => [...container.querySelectorAll(".tr4de-cat-row")];
    // Dans une ligne : la pastille de couleur, puis le nom (un bouton qui
    // devient un champ au clic).
    const names = () => rows().map(r => (r.querySelectorAll("button")[1]?.textContent || "").trim());
    const before = names();
    expect(before[0]).toBe("Développement");

    /* On saisit la troisième ligne par sa poignée et on la dépose sur la
       première. jsdom rend des rectangles à zéro : le point de dépôt tombe donc
       dans la moitié BASSE de la ligne visée, soit « après » — la catégorie
       déplacée doit arriver en deuxième position. */
    const third = rows()[2];
    const label = names()[2];
    fireEvent.pointerDown(third.querySelector(".tr4de-cat-grip")!);
    fireEvent.dragStart(third);
    fireEvent.dragOver(rows()[0], { clientY: 0 });
    fireEvent.drop(rows()[0]);
    expect(names().indexOf(label)).toBe(1);
    expect(names()[0]).toBe(before[0]);

    // « Non classé » ferme la liste quoi qu'il arrive : elle n'a pas de poignée.
    const last = rows()[rows().length - 1];
    expect(last.querySelector(".tr4de-cat-grip")).toBeNull();
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
