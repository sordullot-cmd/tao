import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

/* La page ne lit QUE son adresse : c'est tout l'enjeu, puisqu'elle s'affiche
   dans un navigateur qui n'est peut-être pas connecté. Le mock ne fait donc
   que fournir cette adresse. */
let query = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    <a href={href}>{children}</a>,
}));

import BlockedPage from "@/app/blocked/page";

function show(q: string) {
  query = q;
  return render(<BlockedPage />);
}

describe("page de blocage", () => {
  it("nomme le site coupé, la liste et la session", () => {
    show("t=YouTube&l=Vidéo&s=Deep work&n=1");
    expect(screen.getByRole("heading")).toHaveTextContent("YouTube est coupé");
    expect(screen.getByText(/Liste « Vidéo »/)).toBeInTheDocument();
    expect(screen.getByText(/Deep work/)).toBeInTheDocument();
  });

  it("décompte le temps restant à partir de l'heure de fin", () => {
    show(`t=X&u=${Date.now() + 42 * 60_000}`);
    expect(screen.getByText(/Il reste/)).toHaveTextContent("42 min");
  });

  it("change de phrase à la deuxième tentative", () => {
    const first = show("t=X&n=1").container.textContent;
    const second = show("t=X&n=2").container.textContent;
    expect(second).not.toBe(first);
    expect(second).toContain("Deuxième fois");
  });

  it("tient debout sans aucun paramètre", () => {
    show("");
    expect(screen.getByRole("heading")).toHaveTextContent("Ce site est coupé");
    expect(screen.getByText(/Session de focus en cours/)).toBeInTheDocument();
  });

  it("renomme l'onglet par ce qu'il bloque", () => {
    /* L'onglet s'appelait « YouTube » ; il ne doit pas s'appeler « tao trade »,
       qui ne dit rien de ce qui vient de se passer et se rouvre par curiosité. */
    show("t=YouTube");
    expect(document.title).toBe("YouTube est coupé");
  });

  it("n'offre aucune sortie vers le site coupé", () => {
    /* La sortie vit dans l'app, derrière la friction du mode de session : la
       proposer ici la contournerait. Le seul lien ramène à l'app. */
    show("t=YouTube");
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/dashboard");
  });
});
