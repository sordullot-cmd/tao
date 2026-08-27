import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/* Ce que ce fichier garantit : le champ « Établissement » propose la liste des
   banques (donc leur logo) SANS enfermer la saisie. Les deux moitiés de la
   promesse comptent autant l'une que l'autre — un champ qui propose mais refuse
   « Crédit du grand-père » serait une régression, pas une amélioration. */

/* La persistance passe par `useCloudState` (Supabase + localStorage) : remplacée
   par un état en mémoire, dont le test lit le contenu pour vérifier CE QUI EST
   ÉCRIT — le logo enregistré avec le crédit, pas seulement celui affiché. */
const cloudStore = new Map<string, unknown>();
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(() => (cloudStore.has(k) ? cloudStore.get(k) : d));
    const set = (u: unknown) => setV((prev: unknown) => {
      const next = typeof u === "function" ? (u as (p: unknown) => unknown)(prev) : u;
      cloudStore.set(k, next);
      return next;
    });
    /* 3ᵉ élément : le hook réel annonce l'hydratation TERMINÉE dès qu'il n'y a
       pas d'utilisateur, ce qui est le cas ici. Un mock qui l'omet laisse les
       pages sur leur squelette de chargement, indéfiniment. */
    return [v, set, true];
  },
}));

import ComboInput from "@/components/ui/ComboInput";
import { institutionLogo, resetInstitutionsCache } from "@/lib/bank/useBankInstitutions";
import { AssetFormModal } from "@/components/modals/PatrimoineModals";

const CATALOGUE = [
  { id: "Boursorama", name: "Boursorama", logo: "https://aggregateur/bourso.png" },
  { id: "Société Générale", name: "Société Générale", logo: "https://aggregateur/sg.png" },
  { id: "N26", name: "N26", logo: null },
];

/** Le champ est piloté par son parent : le test tient la valeur à sa place. */
function Harness({ options = [] as { id: string; label: string; iconUrl?: string | null }[] }) {
  const [value, setValue] = React.useState("");
  return (
    <>
      <ComboInput
        value={value}
        onChange={setValue}
        options={options}
        ariaLabel="Établissement"
        placeholder="Boursorama"
        emptyLabel="Aucune banque de ce nom"
      />
      <output data-testid="valeur">{value}</output>
    </>
  );
}

const OPTIONS = CATALOGUE.map((i) => ({ id: i.id, label: i.name, iconUrl: i.logo }));

describe("champ Établissement — liste des banques, saisie libre", () => {
  beforeEach(() => { resetInstitutionsCache(); });

  it("propose le catalogue au clic dans le champ, favoris en tête", () => {
    render(<Harness options={OPTIONS} />);
    fireEvent.mouseDown(screen.getByRole("combobox"));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    /* Le nom ACCESSIBLE, pas le texte brut : le logo est décoratif, un lecteur
       d'écran ne doit pas annoncer « N2 N26 ». */
    expect(options[0]).toHaveAccessibleName("Boursorama");
    expect(options[1]).toHaveAccessibleName("Société Générale");
    expect(options[2]).toHaveAccessibleName("N26");
  });

  it("filtre à la frappe, accents et casse ignorés", () => {
    render(<Harness options={OPTIONS} />);
    const champ = screen.getByRole("combobox");
    fireEvent.change(champ, { target: { value: "societe" } });

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName("Société Générale");
  });

  it("arriver par Tab n'ouvre pas la liste — elle ne doit pas recouvrir le formulaire", () => {
    render(<Harness options={OPTIONS} />);
    fireEvent.focus(screen.getByRole("combobox"));

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("un clic sur une banque écrit son nom dans le champ", () => {
    render(<Harness options={OPTIONS} />);
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Boursorama" }));

    expect(screen.getByTestId("valeur").textContent).toBe("Boursorama");
    // La liste se referme : on a choisi, il n'y a plus rien à parcourir.
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("garde un nom absent du catalogue — la saisie reste libre", () => {
    render(<Harness options={OPTIONS} />);
    const champ = screen.getByRole("combobox");
    fireEvent.change(champ, { target: { value: "Crédit du grand-père" } });

    expect(screen.getByTestId("valeur").textContent).toBe("Crédit du grand-père");
    expect(screen.getByText("Aucune banque de ce nom")).toBeInTheDocument();
  });

  it("sans catalogue, c'est un champ texte ordinaire — pas de liste vide à ouvrir", () => {
    render(<Harness options={[]} />);
    const champ = screen.getByRole("combobox");
    fireEvent.mouseDown(champ);
    fireEvent.change(champ, { target: { value: "Ma banque" } });

    expect(screen.getByTestId("valeur").textContent).toBe("Ma banque");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("Entrée valide la suggestion parcourue au clavier, pas la première de la liste", () => {
    render(<Harness options={OPTIONS} />);
    const champ = screen.getByRole("combobox");
    fireEvent.mouseDown(champ);
    // Sans flèche, Entrée ne doit rien choisir : la saisie libre prime.
    fireEvent.keyDown(champ, { key: "Enter" });
    expect(screen.getByTestId("valeur").textContent).toBe("");

    // ↓ sur une liste fermée la ROUVRE sans rien parcourir — d'où le troisième.
    fireEvent.keyDown(champ, { key: "ArrowDown" });
    fireEvent.keyDown(champ, { key: "ArrowDown" });
    fireEvent.keyDown(champ, { key: "ArrowDown" });
    fireEvent.keyDown(champ, { key: "Enter" });
    expect(screen.getByTestId("valeur").textContent).toBe("Société Générale");
  });
});

describe("institutionLogo", () => {
  it("retrouve la banque malgré la casse, les accents et les espaces en trop", () => {
    expect(institutionLogo(CATALOGUE, "societe  GENERALE")).toBe("https://aggregateur/sg.png");
  });

  it("rend null pour un établissement inconnu — jamais un logo inventé", () => {
    expect(institutionLogo(CATALOGUE, "Crédit du grand-père")).toBeNull();
    expect(institutionLogo(CATALOGUE, "")).toBeNull();
    expect(institutionLogo(CATALOGUE, null)).toBeNull();
  });

  it("rend null quand la banque est connue mais sans logo", () => {
    expect(institutionLogo(CATALOGUE, "N26")).toBeNull();
  });

  it("le logo livré avec l'application passe devant celui de l'agrégateur", () => {
    // `/banque/boursorama.jpg` est le fichier local (cf. lib/bank/bankLogos).
    expect(institutionLogo(CATALOGUE, "Boursorama")).toBe("/banque/boursorama.jpg");
  });

  it("sans catalogue, un nom connu garde son logo local", () => {
    expect(institutionLogo([], "boursobank")).toBe("/banque/boursorama.jpg");
    expect(institutionLogo([], "Une banque quelconque")).toBeNull();
  });
});

describe("formulaire d'un crédit", () => {
  beforeEach(() => {
    cloudStore.clear();
    resetInstitutionsCache();
    // L'interface est en français par défaut dans l'application.
    localStorage.setItem("tr4de_lang", "fr");
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ configured: true, institutions: CATALOGUE }),
    })));
  });

  /* Les libellés de `Field` ne sont pas rattachés à leur contrôle (pas de
     `htmlFor`) : on passe donc par les indications de saisie, comme les autres
     tests de modales. Le champ « Établissement », lui, porte un `aria-label`. */
  const saisir = (placeholder: string, valeur: string) => {
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: valeur } });
  };

  it("enregistre le logo de la banque choisie, et le capital en négatif", async () => {
    render(<AssetFormModal defaultType="loan" onClose={() => {}} />);

    // La liste arrive du réseau : le champ n'a de suggestions qu'après.
    await waitFor(() => expect(screen.getByText(/Choisis ta banque/)).toBeInTheDocument());

    saisir("Crédit immobilier", "Crédit immobilier");
    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Boursorama" }));
    saisir("150000", "150000");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un actif" }));

    const assets = (cloudStore.get("tr4de_patrimoine") as { assets: Record<string, unknown>[] }).assets;
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      name: "Crédit immobilier",
      type: "loan",
      institution: "Boursorama",
      logo: "/banque/boursorama.jpg",
      balance: -150000,
    });
  });

  it("accepte un établissement hors catalogue, sans logo", async () => {
    render(<AssetFormModal defaultType="loan" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Choisis ta banque/)).toBeInTheDocument());

    saisir("Crédit immobilier", "Prêt familial");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Mon oncle" } });
    saisir("150000", "8000");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un actif" }));

    const assets = (cloudStore.get("tr4de_patrimoine") as { assets: Record<string, unknown>[] }).assets;
    expect(assets[0]).toMatchObject({ institution: "Mon oncle", logo: null, balance: -8000 });
  });
});

describe("vignette d'un actif", () => {
  it("affiche le logo de l'établissement, à défaut les initiales du nom", async () => {
    const { default: AssetAvatar } = await import("@/components/ui/AssetAvatar");

    const { container: avecLogo } = render(
      <AssetAvatar asset={{ id: "1", name: "Crédit immo", type: "loan", balance: -1000, institution: "Boursorama" }} />,
    );
    expect(avecLogo.querySelector("img")).toHaveAttribute("src", "/banque/boursorama.jpg");

    const { container: sansLogo } = render(
      <AssetAvatar asset={{ id: "2", name: "Prêt familial", type: "loan", balance: -500, institution: null }} />,
    );
    expect(sansLogo.querySelector("img")).toBeNull();
    expect(sansLogo.textContent).toBe("PR");
  });
});
