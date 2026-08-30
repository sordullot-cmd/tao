import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

/* Les figures de la section « Activité » se lisent au survol : une colonne de
   graphe ne porte aucun texte, et l'infobulle native du navigateur arrivait
   trop tard pour dire ce que la souris désigne. Ce test vérifie que chaque
   forme — colonne, barre, part empilée — ouvre bien sa bulle, et qu'elle se
   referme quand on la quitte. */

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

import { AppRows, CategoryRows, HourBars, ScreenTimeBars, StackedBar } from "@/components/activity/ActivityChrome";
import ActivityReportsPage from "@/components/pages/ActivityReportsPage";
import ActivityPage from "@/components/pages/ActivityPage";
import { getLocalDateString } from "@/lib/dateUtils";
import { saveDay } from "@/lib/activity/engine";

beforeEach(() => {
  localStorage.clear();
});

const MIN = 60_000;

/* Les zones de détail superposent deux listes, celle qu'on ne lit pas restant
   montée mais masquée (c'est elle qui fige la hauteur du bloc). Les assertions
   « n'affiche pas X » doivent donc viser la COUCHE VISIBLE, pas la zone. */
const visibleOf = (zone: HTMLElement) =>
  [...zone.querySelectorAll<HTMLElement>('div[style*="grid-area"]')]
    .find(el => el.style.visibility !== "hidden") as HTMLElement;

describe("survol des figures d'activité", () => {
  it("ouvre la bulle d'une tranche horaire, avec sa ventilation", () => {
    render(
      <HourBars hourly={[
        { hour: 9, ms: 45 * MIN, productiveMs: 30 * MIN, distractingMs: 5 * MIN },
        { hour: 10, ms: 0, productiveMs: 0, distractingMs: 0 },
      ]} />,
    );
    const col = screen.getByLabelText("09 h — 45 min");
    fireEvent.mouseEnter(col);

    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("09 h – 10 h");
    expect(tip).toHaveTextContent("Productif");
    expect(tip).toHaveTextContent("30 min");
    // Le neutre est déduit, pas fourni : 45 − 30 − 5.
    expect(tip).toHaveTextContent("10 min");

    fireEvent.mouseLeave(col.parentElement as HTMLElement);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("répond aussi sur une heure vide — « rien » est une réponse", () => {
    render(<HourBars hourly={[{ hour: 3, ms: 0, productiveMs: 0, distractingMs: 0 }]} />);
    fireEvent.mouseEnter(screen.getByLabelText("03 h — 0 s"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Rien de mesuré");
  });

  it("détaille une journée de la semaine sans la sélectionner", () => {
    const day = { date: "2024-06-03", activeMs: 300 * MIN, productiveMs: 180 * MIN, distractingMs: 60 * MIN };
    render(<ScreenTimeBars days={[day]} selected="2024-06-05" />);

    // La suite est épinglée en anglais (tests/setup.ts) : on reconstruit le
    // libellé plutôt que de figer une langue dans l'attente.
    const label = new Date("2024-06-03T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const col = screen.getByLabelText(`${label} — 5 h 00`);
    fireEvent.mouseEnter(col);

    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("3 h 00");   // productif
    expect(tip).toHaveTextContent("1 h 00");   // neutre : 5 h − 3 h − 1 h
    expect(tip).toHaveTextContent("5 h 00");   // temps d'écran
  });

  it("donne la part exacte d'une catégorie, que la ligne ne montre pas toujours", () => {
    render(
      <CategoryRows
        buckets={[{ id: "dev", label: "Développement", color: "#4C6FFF", ms: 96 * MIN, pct: 37.4 }]}
        showShare={false}
      />,
    );
    fireEvent.mouseEnter(screen.getByText("Développement"));

    const tip = screen.getByRole("tooltip");
    // Durée et part tiennent sur UNE ligne : deux façons de dire la même
    // quantité n'ont pas à être séparées d'un cran.
    expect(tip).toHaveTextContent("1 h 36 · 37.4 %");
    expect(tip).not.toHaveTextContent(/Part du temps/);
  });

  it("déplie les titres de fenêtre d'une application au survol", () => {
    render(
      <AppRows apps={[{
        id: "code", label: "VS Code", color: "#4C6FFF", cat: "dev", ms: 60 * MIN, pct: 50,
        titles: [{ title: "engine.ts", ms: 40 * MIN }, { title: "stats.ts", ms: 20 * MIN }],
      }]} />,
    );
    fireEvent.mouseEnter(screen.getByText("VS Code"));

    const tip = screen.getByRole("tooltip");
    // Le second titre n'est visible NULLE PART ailleurs : la ligne n'affiche
    // que le premier.
    expect(tip).toHaveTextContent("stats.ts");
    expect(tip).toHaveTextContent("1 h 00 · 50 %");
    expect(tip).not.toHaveTextContent(/Part du temps/);
  });

  it("dit, pour une catégorie, quelles applications et quels sites l'ont remplie", () => {
    render(
      <CategoryRows
        buckets={[{ id: "fun", label: "Divertissement", color: "#FF4B4B", ms: 70 * MIN, pct: 30 }]}
        showShare={false}
        apps={[
          { id: "yt", label: "Youtube", cat: "fun", ms: 50 * MIN, pct: 20 },
          { id: "tw", label: "Twitter", cat: "fun", ms: 20 * MIN, pct: 10 },
          { id: "code", label: "VS Code", cat: "dev", ms: 60 * MIN, pct: 25 },
        ]}
      />,
    );
    fireEvent.mouseEnter(screen.getByText("Divertissement"));

    const tip = screen.getByRole("tooltip");
    // Un total ne dit pas si c'est une série ou dix fois deux minutes.
    expect(tip).toHaveTextContent("Youtube");
    expect(tip).toHaveTextContent("Twitter");
    // Une application d'une AUTRE catégorie n'a rien à faire là.
    expect(tip).not.toHaveTextContent("VS Code");
  });

  it("ne pose aucun fond derrière la ligne survolée", () => {
    /* Un voile gris posé sur une liste de barres colorées ternit la seule chose
       qu'on est venu comparer : la bulle suffit comme accusé de réception. */
    render(
      <CategoryRows
        buckets={[{ id: "dev", label: "Développement", color: "#4C6FFF", ms: 96 * MIN, pct: 37.4 }]}
        showShare={false}
      />,
    );
    const row = screen.getByText("Développement").closest("div")!.parentElement!.parentElement!;
    fireEvent.mouseEnter(row);
    // La bulle prouve que le survol a bien porté sur cette ligne-là.
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(row.style.background).toBe("");
    expect(row.style.backgroundColor).toBe("");
  });

  it("nomme chaque part d'une barre empilée", () => {
    render(
      <StackedBar parts={[
        { id: "dev", label: "Développement", color: "#4C6FFF", ms: 120 * MIN, pct: 60 },
        { id: "fun", label: "Divertissement", color: "#FF4B4B", ms: 80 * MIN, pct: 40 },
      ]} />,
    );
    fireEvent.mouseEnter(screen.getByLabelText("Divertissement — 1 h 20"));

    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Divertissement");
    expect(tip).toHaveTextContent("40 %");
  });
});

describe("survol du graphe de régularité (Rapports)", () => {
  it("nomme le jour et ce qui l'a rempli — les colonnes n'ont pas d'axe qui le dise", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-06-05T10:00:00"));
    try {
      saveDay({
        date: "2024-06-03", awayMs: 0, updatedAt: Date.now(),
        segments: [
          { s: new Date("2024-06-03T14:00:00").getTime(), e: new Date("2024-06-03T16:00:00").getTime(), app: "Figma", label: "Figma", title: "", cat: "work" },
          { s: new Date("2024-06-03T16:00:00").getTime(), e: new Date("2024-06-03T16:30:00").getTime(), app: "Chrome", label: "Youtube", title: "Lofi - YouTube", cat: "fun" },
        ],
      });
      render(<ActivityReportsPage setPage={vi.fn()} />);

      const label = new Date("2024-06-03T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      /* Le survol vise la PART, pas la colonne : c'est la catégorie qu'on
         désigne, pas le total du jour. */
      fireEvent.mouseEnter(screen.getByLabelText(new RegExp(`^${label} · Réseaux sociaux —`)));

      const tip = screen.getByRole("tooltip");
      expect(tip).toHaveTextContent("Réseaux sociaux");
      expect(tip).toHaveTextContent(label);
      expect(tip).toHaveTextContent("30 min");
      // La part de la journée, que la hauteur de la bande ne chiffre pas.
      expect(tip).toHaveTextContent("20 %");
      expect(tip).toHaveTextContent("2 h 30");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("détail au survol de l'anneau (Journée)", () => {
  it("descend la liste des catégories au niveau des apps et des sites", () => {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const at = (min: number) => base.getTime() + min * 60_000;
    saveDay({
      date: getLocalDateString(),
      awayMs: 0,
      updatedAt: Date.now(),
      segments: [
        { s: at(0), e: at(60), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
        { s: at(60), e: at(80), app: "Chrome", label: "GitHub", title: "PR · github.com/tr4de", cat: "dev" },
        { s: at(80), e: at(110), app: "Chrome", label: "Youtube", title: "Lofi - YouTube", cat: "fun" },
      ],
    });
    render(<ActivityPage setPage={vi.fn()} />);

    // Avant tout survol, la liste voisine de l'anneau nomme les CATÉGORIES.
    const ring = screen.getByLabelText("Répartition du temps par catégorie");
    const side = screen.getByRole("group", { name: "Répartition détaillée" });
    expect(side).toHaveTextContent("Développement");

    // Survoler la part « Développement » : la liste passe à ce qui la compose.
    const arc = ring.querySelector("circle[stroke-dasharray]") as SVGCircleElement;
    fireEvent.mouseEnter(arc);
    expect(side).toHaveTextContent("VS Code");
    expect(side).toHaveTextContent("GitHub");
    // Youtube est d'une AUTRE catégorie : il n'a rien à faire dans ce détail.
    expect(side).not.toHaveTextContent("Youtube");

    /* La liste des catégories reste MONTÉE sous le détail, seulement masquée :
       c'est elle qui impose sa hauteur au bloc. Sans ça, un détail plus court
       rétrécissait la carte, l'anneau — centré verticalement — remontait, le
       curseur n'était plus sur la part, et le survol se coupait tout seul. */
    const hidden = side.querySelector('div[style*="visibility"]') as HTMLElement;
    expect(hidden.style.visibility).toBe("hidden");
    expect(hidden).toHaveTextContent("Développement");

    // La souris repart : on revient aux catégories.
    fireEvent.mouseLeave(arc);
    expect(side).toHaveTextContent("Développement");
    expect(side).not.toHaveTextContent("VS Code");
  });
});

/* ── Ce que le survol fait à la figure, pas seulement à la bulle ──────────── */

describe("mise en avant au survol des graphes en colonnes", () => {
  const HOURS = [
    { hour: 9, ms: 45 * MIN, productiveMs: 30 * MIN, distractingMs: 5 * MIN },
    { hour: 10, ms: 20 * MIN, productiveMs: 20 * MIN, distractingMs: 0 },
    { hour: 11, ms: 0, productiveMs: 0, distractingMs: 0 },
  ];

  it("laisse la colonne visée à pleine encre et fait reculer les autres", () => {
    render(<HourBars hourly={HOURS} />);
    const col = (h: string) => screen.getByLabelText(new RegExp(`^${h} h —`));

    // Au repos, aucune colonne n'est éteinte : la figure se lit entière.
    expect(col("09").style.opacity).toBe("1");
    expect(col("10").style.opacity).toBe("1");

    fireEvent.mouseEnter(col("09"));
    expect(col("09").style.opacity).toBe("1");
    expect(col("10").style.opacity).toBe("0.4");
    expect(col("11").style.opacity).toBe("0.4");
  });

  it("n'assombrit aucune colonne — c'est la partie vide qui se colorait", () => {
    /* Le défaut : un fond posé derrière la colonne ENTIÈRE teintait aussi le
       vide au-dessus de la barre, c'est-à-dire une surface qui ne représente
       aucune valeur. */
    render(<HourBars hourly={HOURS} />);
    const col = screen.getByLabelText(/^09 h —/);
    fireEvent.mouseEnter(col);
    expect(col.style.background).toBe("");
    expect(col.style.backgroundColor).toBe("");
  });

  it("garde la semaine entière lisible tant que rien n'est survolé", () => {
    /* L'inverse d'avant : les jours non sélectionnés partaient à 0,55 en
       PERMANENCE, si bien que le survol ne faisait pas ressortir la colonne
       visée — il rallumait les autres. */
    const days = [
      { date: "2024-06-03", activeMs: 300 * MIN, productiveMs: 180 * MIN, distractingMs: 60 * MIN },
      { date: "2024-06-04", activeMs: 120 * MIN, productiveMs: 60 * MIN, distractingMs: 30 * MIN },
    ];
    render(<ScreenTimeBars days={days} selected="2024-06-04" />);
    const col = (d: string) => {
      const label = new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      return screen.getByLabelText(new RegExp(`^${label} —`));
    };

    expect(col("2024-06-03").style.opacity).toBe("1");
    expect(col("2024-06-04").style.opacity).toBe("1");

    fireEvent.mouseEnter(col("2024-06-03"));
    expect(col("2024-06-03").style.opacity).toBe("1");
    expect(col("2024-06-03").style.background).toBe("");
    // Le jour SÉLECTIONNÉ recule comme les autres : c'est le survol qui mène.
    expect(col("2024-06-04").style.opacity).toBe("0.4");
  });
});

describe("détail au survol des figures de la semaine (Journée)", () => {
  /* Une semaine tient sur deux jours mesurés : ce qui compte, c'est que les
     barres de la carte hebdomadaire commandent la liste qui les détaille. */
  function seedWeek() {
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const at = (h: number) => { const d = new Date(monday); d.setHours(h, 0, 0, 0); return d.getTime(); };
    saveDay({
      date: getLocalDateString(monday), awayMs: 0, updatedAt: Date.now(),
      segments: [
        { s: at(9), e: at(11), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
        { s: at(11), e: at(12), app: "Chrome", label: "GitHub", title: "PR · github.com/tr4de", cat: "dev" },
        { s: at(14), e: at(15), app: "Chrome", label: "Youtube", title: "Lofi - YouTube", cat: "fun" },
      ],
    });
  }

  it("descend la barre des catégories jusqu'aux applications", () => {
    seedWeek();
    render(<ActivityPage setPage={vi.fn()} />);

    const side = screen.getByRole("group", { name: "Répartition hebdomadaire détaillée" });
    expect(side).toHaveTextContent("Développement");
    expect(side).not.toHaveTextContent("VS Code");

    // La barre empilée des catégories, au-dessus de la liste hebdomadaire.
    fireEvent.mouseEnter(screen.getByLabelText(/^Développement — 3 h 00/));

    expect(side).toHaveTextContent("VS Code");
    expect(side).toHaveTextContent("GitHub");
    // Youtube est d'une autre catégorie : il n'a rien à faire dans ce détail.
    expect(visibleOf(side)).not.toHaveTextContent("Youtube");
  });

  it("restreint la liste aux catégories d'une nature, sans jamais la vider", () => {
    seedWeek();
    render(<ActivityPage setPage={vi.fn()} />);

    /* La barre des natures : sous « Productif », le cran du dessous n'est pas
       l'application mais la catégorie — « qu'est-ce qui est compté comme
       productif ? ». */
    const side = screen.getByRole("group", { name: "Répartition hebdomadaire détaillée" });
    fireEvent.mouseEnter(screen.getByLabelText(/^Productif —/));

    const shown = visibleOf(side);
    expect(shown).toHaveTextContent("Développement");
    // « Divertissement » est une distraction : il quitte la liste le temps du
    // survol (il reste dans la liste masquée, qui tient la hauteur du bloc).
    expect(shown).not.toHaveTextContent("Divertissement");
  });
});

describe("détail au survol de l'anneau (Rapports)", () => {
  it("descend la liste des catégories au niveau des apps et des sites", () => {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const at = (min: number) => base.getTime() + min * 60_000;
    saveDay({
      date: getLocalDateString(), awayMs: 0, updatedAt: Date.now(),
      segments: [
        { s: at(0), e: at(60), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
        { s: at(60), e: at(90), app: "Chrome", label: "Youtube", title: "Lofi - YouTube", cat: "fun" },
      ],
    });
    render(<ActivityReportsPage setPage={vi.fn()} />);

    const side = screen.getByRole("group", { name: "Répartition détaillée" });
    expect(side).toHaveTextContent("Développement");

    const ring = screen.getByLabelText("Répartition du temps par catégorie sur la période");
    fireEvent.mouseEnter(ring.querySelector("circle[stroke-dasharray]") as SVGCircleElement);
    expect(side).toHaveTextContent("VS Code");
    expect(side).not.toHaveTextContent("Youtube");

    // La liste des catégories reste montée sous le détail : c'est elle qui
    // tient la hauteur du bloc.
    const hidden = side.querySelector('div[style*="visibility"]') as HTMLElement;
    expect(hidden.style.visibility).toBe("hidden");
  });
});

describe("sélection figée au clic", () => {
  it("garde la bulle après le départ de la souris, et la rend à Échap", () => {
    render(
      <HourBars hourly={[
        { hour: 9, ms: 45 * MIN, productiveMs: 30 * MIN, distractingMs: 5 * MIN },
        { hour: 10, ms: 20 * MIN, productiveMs: 20 * MIN, distractingMs: 0 },
      ]} />,
    );
    const col = screen.getByLabelText("09 h — 45 min");

    // Sans clic, la bulle vit le temps du survol.
    fireEvent.mouseEnter(col);
    fireEvent.mouseLeave(col.parentElement as HTMLElement);
    expect(screen.queryByRole("tooltip")).toBeNull();

    // Le clic la fige : lire un détail ne demande plus de garder le curseur
    // immobile sur une colonne de quelques pixels.
    fireEvent.click(col);
    fireEvent.mouseLeave(col.parentElement as HTMLElement);
    expect(screen.getByRole("tooltip")).toHaveTextContent("09 h – 10 h");

    // Survoler ailleurs ne vole pas la sélection.
    fireEvent.mouseEnter(screen.getByLabelText("10 h — 20 min"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("09 h – 10 h");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("libère la sélection sur un clic ailleurs, mais pas dans la figure", () => {
    render(
      <div>
        <StackedBar parts={[
          { id: "dev", label: "Développement", color: "#4C6FFF", ms: 120 * MIN, pct: 60 },
          { id: "fun", label: "Divertissement", color: "#FF4B4B", ms: 80 * MIN, pct: 40 },
        ]} />
        <button type="button">ailleurs</button>
      </div>,
    );
    const part = screen.getByLabelText("Divertissement — 1 h 20");
    fireEvent.click(part);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Divertissement");

    // Un clic sur une AUTRE part déplace la sélection au lieu de la fermer.
    fireEvent.mouseDown(screen.getByLabelText("Développement — 2 h 00"));
    fireEvent.click(screen.getByLabelText("Développement — 2 h 00"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Développement");

    // Le fond, lui, libère.
    fireEvent.mouseDown(screen.getByText("ailleurs"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("re-cliquer la même part la libère", () => {
    render(<HourBars hourly={[{ hour: 9, ms: 45 * MIN, productiveMs: 30 * MIN, distractingMs: 5 * MIN }]} />);
    const col = screen.getByLabelText("09 h — 45 min");
    fireEvent.click(col);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseDown(col);
    fireEvent.click(col);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("ne fige rien sur une ligne de liste ni sur une bande de régularité", () => {
    /* Deux figures explicitement laissées au seul survol : la ligne de liste
       porte déjà son nom et sa durée en clair, et une bande de régularité de
       deux pixels se clique par accident. */
    render(
      <CategoryRows
        buckets={[{ id: "social", label: "Réseaux sociaux", color: "#FF4B4B", ms: 40 * MIN, pct: 12 }]}
        showShare={false}
      />,
    );
    const row = screen.getByText("Réseaux sociaux").closest("div")!.parentElement!.parentElement!;
    fireEvent.mouseEnter(row);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.click(row);
    fireEvent.mouseLeave(row);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("laisse la régularité au seul survol", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2024-06-05T10:00:00"));
    try {
      saveDay({
        date: "2024-06-03", awayMs: 0, updatedAt: Date.now(),
        segments: [{ s: new Date("2024-06-03T14:00:00").getTime(), e: new Date("2024-06-03T16:00:00").getTime(), app: "Figma", label: "Figma", title: "", cat: "work" }],
      });
      render(<ActivityReportsPage setPage={vi.fn()} />);

      const label = new Date("2024-06-03T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      const band = screen.getByLabelText(new RegExp(`^${label} · `));
      fireEvent.mouseEnter(band);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      fireEvent.click(band);
      fireEvent.mouseLeave(band.closest("div[style*=\"position: relative\"]") as HTMLElement);
      expect(screen.queryByRole("tooltip")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fige le détail d'une catégorie de l'anneau", () => {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const at = (min: number) => base.getTime() + min * 60_000;
    saveDay({
      date: getLocalDateString(), awayMs: 0, updatedAt: Date.now(),
      segments: [
        { s: at(0), e: at(60), app: "Code", label: "VS Code", title: "engine.ts", cat: "dev" },
        { s: at(60), e: at(90), app: "Chrome", label: "Youtube", title: "Lofi - YouTube", cat: "fun" },
      ],
    });
    render(<ActivityPage setPage={vi.fn()} />);

    const side = screen.getByRole("group", { name: "Répartition détaillée" });
    const ring = screen.getByLabelText("Répartition du temps par catégorie");
    const arc = ring.querySelector("circle[stroke-dasharray]") as SVGCircleElement;

    fireEvent.click(arc);
    fireEvent.mouseLeave(arc);
    // La souris est partie : sans épinglage, la liste serait revenue aux
    // catégories.
    expect(visibleOf(side)).toHaveTextContent("VS Code");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(visibleOf(side)).toHaveTextContent("Développement");
    expect(visibleOf(side)).not.toHaveTextContent("VS Code");
  });
});
