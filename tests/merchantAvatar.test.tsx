/**
 * Vignette d'une opération : les trois états, du logo livré au repli silencieux.
 * Le dernier est le plus important — sans marchand reconnu, la vignette ne doit
 * RIEN rendre, faute de quoi l'appelant afficherait deux disques côte à côte.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import MerchantAvatar from "@/components/ui/MerchantAvatar";

describe("MerchantAvatar", () => {
  it("sert le logo quand le marchand en a un", () => {
    const { container } = render(
      <MerchantAvatar merchant={{ slug: "revolut", name: "Revolut", color: "#1A1A1A", logo: "/banque/revolut.webp" }} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/banque/revolut.webp");
  });

  it("à défaut, les initiales sur la couleur de la marque", () => {
    const { container } = render(
      <MerchantAvatar merchant={{ slug: "uber-eats", name: "Uber Eats", color: "#06C167" }} />,
    );
    const dot = container.firstElementChild as HTMLElement;
    expect(dot.textContent).toBe("UE");
    expect(dot.style.background).toBe("rgb(6, 193, 103)");
    // Vert clair : l'encre doit passer au sombre pour rester lisible.
    expect(dot.style.color).toBe("rgb(0, 0, 0)");
  });

  it("ne rend rien sans marchand", () => {
    const { container } = render(<MerchantAvatar merchant={null} />);
    expect(container.firstElementChild).toBeNull();
  });
});
