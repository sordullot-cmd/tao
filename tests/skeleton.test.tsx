import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, act } from "@testing-library/react";

import {
  Skeleton, SkeletonList, SkeletonScreen, SkeletonChart, PageSkeleton, SkeletonToolbar,
} from "@/components/ui/Skeleton";
import { useFirstLoad } from "@/lib/hooks/useFirstLoad";

/* `localStorage.clear()` emporte aussi la langue épinglée par tests/setup.ts
   (son `beforeEach` s'exécute AVANT celui d'un fichier de test) : sans la
   reposer, les libellés repartent en français au milieu d'une suite anglaise. */
function resetStorage() {
  cleanup();
  localStorage.clear();
  localStorage.setItem("tr4de_lang", "en");
}

describe("Squelettes de chargement", () => {
  beforeEach(resetStorage);

  it("délègue le balayage à la feuille de style au lieu d'animer en ligne", () => {
    /* La classe est le contrat : c'est elle que `prefers-reduced-motion` coupe
       dans globals.css. Une animation posée en style inline y échapperait, et
       les gens qui ont demandé l'arrêt du mouvement verraient scintiller. */
    const { container } = render(<Skeleton width={120} height={16} />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.classList.contains("anim-shimmer")).toBe(true);
    expect(bar.style.animation).toBe("");
  });

  it("laisse passer la classe de l'appelant sans perdre la sienne", () => {
    const { container } = render(<Skeleton className="tr4de-custom" />);
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.classList.contains("anim-shimmer")).toBe(true);
    expect(bar.classList.contains("tr4de-custom")).toBe(true);
  });

  it("tait les barres au lecteur d'écran et n'annonce l'attente qu'une fois", () => {
    /* Quarante rectangles gris énoncés un par un seraient pires que le
       silence : seule l'enveloppe parle. */
    render(<SkeletonScreen label="Loading trades"><SkeletonList rows={5} /></SkeletonScreen>);
    expect(screen.getByRole("status").textContent).toBe("Loading trades");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    for (const bar of document.querySelectorAll(".anim-shimmer")) {
      expect(bar.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("retombe sur le libellé traduit quand l'appelant n'en donne pas", () => {
    render(<PageSkeleton variant="list" />);
    expect(screen.getByRole("status").textContent).toBe("Loading...");
  });

  it("ouvre sur une rangée de commandes à 34 px, et non sur un titre de page", () => {
    /* Le contrat de FORME. Aucune page du site n'a de titre — la barre latérale
       dit déjà où l'on est ; ce qu'elles posent en tête, ce sont des boutons de
       34 px, la hauteur unique de tous les contrôles. Un squelette qui dessine
       un titre de 26 px suivi d'un sous-titre fait sauter toute la page d'une
       trentaine de pixels au moment où le contenu arrive. */
    const { container } = render(<PageSkeleton variant="list" toolbarRight={[152]} />);
    const bars = [...container.querySelectorAll(".anim-shimmer")] as HTMLElement[];
    expect(bars[0].style.height).toBe("34px");
    expect(bars[0].style.borderRadius).toBe("999px");
  });

  it("pousse les commandes de droite à droite, comme les vraies barres", () => {
    const { container } = render(<SkeletonToolbar left={[80]} right={[120]} />);
    const row = container.firstElementChild as HTMLElement;
    const [leftBar, rightGroup] = [...row.children] as HTMLElement[];
    expect(leftBar.classList.contains("anim-shimmer")).toBe(true);
    expect(rightGroup.style.marginLeft).toBe("auto");
  });

  it("garde les mêmes hauteurs de colonnes d'un rendu à l'autre", () => {
    /* Des hauteurs tirées au hasard feraient s'agiter le graphique en attente
       à chaque re-rendu du parent — un squelette doit être immobile sous son
       balayage. */
    const heights = () => [...document.querySelectorAll(".anim-shimmer")]
      .map(el => (el as HTMLElement).style.height);
    const { rerender } = render(<SkeletonChart bars={6} />);
    const first = heights();
    rerender(<SkeletonChart bars={6} />);
    expect(heights()).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(1);
  });
});

/* ── Le garde qui décide de montrer un squelette ─────────────────────────── */

function Probe({ hydrated, keys }: { hydrated: boolean; keys: string[] }) {
  return <span data-testid="verdict">{String(useFirstLoad(hydrated, ...keys))}</span>;
}
const verdict = () => screen.getByTestId("verdict").textContent;

describe("useFirstLoad", () => {
  beforeEach(resetStorage);

  it("montre le squelette quand rien n'est en cache et que le cloud n'a pas répondu", () => {
    render(<Probe hydrated={false} keys={["tr4de_x"]} />);
    expect(verdict()).toBe("true");
  });

  it("ne remplace JAMAIS un contenu déjà peint depuis le cache", () => {
    /* Le cas qui compte : à la deuxième visite, localStorage répond dans la
       frame. Brancher le squelette sur la seule hydratation cloud
       remplacerait des données réelles par des barres grises — un
       ralentissement perçu, pas un chargement. */
    localStorage.setItem("tr4de_x", JSON.stringify([{ id: 1 }]));
    render(<Probe hydrated={false} keys={["tr4de_x"]} />);
    expect(verdict()).toBe("false");
  });

  it("s'efface dès que l'hydratation est terminée", () => {
    const { rerender } = render(<Probe hydrated={false} keys={["tr4de_x"]} />);
    expect(verdict()).toBe("true");
    rerender(<Probe hydrated keys={["tr4de_x"]} />);
    expect(verdict()).toBe("false");
  });

  it("suffit d'UNE clé en cache pour qu'il y ait de quoi peindre", () => {
    /* Une page qui lit journée + habitudes n'a pas besoin des deux pour
       montrer quelque chose : le squelette est réservé à l'écran totalement
       vide. */
    localStorage.setItem("tr4de_habits", JSON.stringify([]));
    render(<Probe hydrated={false} keys={["tr4de_planner", "tr4de_habits"]} />);
    expect(verdict()).toBe("false");
  });

  it("fige sa réponse au montage plutôt que de la relire à chaque rendu", () => {
    /* Sinon la première écriture locale — celle que fait la page elle-même en
       s'initialisant — ferait disparaître le squelette au milieu de
       l'attente, puis le contenu sauterait à l'arrivée du cloud. */
    const { rerender } = render(<Probe hydrated={false} keys={["tr4de_x"]} />);
    expect(verdict()).toBe("true");
    act(() => { localStorage.setItem("tr4de_x", JSON.stringify([1])); });
    rerender(<Probe hydrated={false} keys={["tr4de_x"]} />);
    expect(verdict()).toBe("true");
  });

  it("ne bloque pas sur un squelette quand le stockage est refusé", () => {
    /* Navigation privée, cookies bloqués : on ne peut rien affirmer sur le
       cache, et un squelette permanent serait pire qu'un état vide fugace. */
    /* L'espion se pose sur l'INSTANCE : tests/setup.ts remplace `localStorage`
       par un objet simple quand jsdom n'en fournit pas, et cet objet-là ne
       descend pas de `Storage.prototype`. */
    const spy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<Probe hydrated={false} keys={["tr4de_x"]} />);
    expect(verdict()).toBe("false");
    spy.mockRestore();
  });
});
