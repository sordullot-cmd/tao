import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import { BlockDetail } from "@/components/activity/ActivityChrome";
import { categoryLabel } from "@/lib/activity/categories";

const MIN = 60_000;

/** Un pavé de la journée, tel que `dayBlocks` le produit. */
const block = {
  start: 0,
  end: 105 * MIN,
  ms: 105 * MIN,
  cat: "social",
  label: "YouTube",
  switches: 0,
  apps: [{
    label: "YouTube",
    cat: "social",
    ms: 105 * MIN,
    app: "Google Chrome",
    isSite: true,
    site: "",
    rules: [],
    titles: [
      { title: "Compilation de chats — YouTube", ms: 90 * MIN },
      { title: "Psycho-Cybernetics, le résumé — YouTube", ms: 15 * MIN },
    ],
  }],
};

describe("détail d'un pavé", () => {
  it("range une fenêtre seule, sans passer par la ligne qui la porte", () => {
    /* Le sélecteur de la ligne range tout ce qui porte son nom, donc tout
       YouTube. Une vidéo de cours et un fil de recommandations sortent du même
       site : sans un geste à cette échelle-ci, la correction est inutilisable
       là où elle sert le plus. */
    const onPickTitle = vi.fn();
    render(
      <BlockDetail
        block={block} activeMs={block.ms} onClose={() => {}}
        onPick={null} onPickTitle={onPickTitle} blocked={null}
      />
    );

    const pastilles = screen.getAllByTitle(/Ranger cette fenêtre seule/);
    expect(pastilles).toHaveLength(2);

    fireEvent.click(pastilles[1]);
    fireEvent.click(screen.getByText(categoryLabel("learning")));

    expect(onPickTitle).toHaveBeenCalledWith("Psycho-Cybernetics, le résumé — YouTube", "learning");
  });

  it("ne propose rien à ranger quand l'appelant ne sait pas quoi en faire", () => {
    // Une pastille qui ne mène nulle part se lit comme un classement figé.
    render(
      <BlockDetail
        block={block} activeMs={block.ms} onClose={() => {}}
        onPick={null} onPickTitle={null} blocked={null}
      />
    );

    expect(screen.queryByTitle(/Ranger cette fenêtre seule/)).toBeNull();
  });
});
