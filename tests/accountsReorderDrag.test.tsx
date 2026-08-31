import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

/**
 * Réordonner la liste « Tous les comptes » à la souris.
 *
 * Le tri lui-même est couvert unité par unité (`tests/accountsOrder`) ; ce qui
 * se joue ici est l'INTÉGRATION : la ligne part-elle vraiment, une firme et un
 * compte autonome se croisent-ils, et l'ordre survit-il au rechargement de la
 * page. Seules les dépendances hors sujet sont neutralisées.
 */

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
  }),
}));
/* Store en mémoire partagé par toutes les instances du hook : c'est ce qui
   permet de démonter puis remonter la page comme le ferait un rechargement. */
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
vi.mock("@/components/pages/ScalingPage", () => ({ RoadmapSection: () => null }));
vi.mock("@/components/modals/AccountModals", () => ({
  PropFirmModal: () => null,
  AccountModal: () => null,
}));

import AccountsPage from "@/components/pages/AccountsPage";

const FIRMS = [{ id: "f1", name: "Topstep", platform: "tradovate" }];
const ACCOUNTS = [
  { id: "a1", name: "Topstep 50k", firm_id: "f1", account_type: "eval", eval_account_size: "50k" },
  { id: "a2", name: "Interactive Brokers", account_type: "live" },
];

const renderPage = () =>
  render(
    <AccountsPage
      accounts={ACCOUNTS} trades={[]} firms={FIRMS} archivedMeta={{}}
      setAccounts={() => {}} setFirms={() => {}} setArchivedMeta={() => {}}
      setPage={() => {}} setSelectedAccountDetailId={() => {}} setSelectedFirmId={() => {}}
    />
  );

/* Le tri se juge dans la section « Tous les comptes » seule : la bande des
   comptes les plus actifs cite les mêmes noms plus haut sur la page. */
const table = () => screen.getByText("All accounts").closest("section") as HTMLElement;

/** La rangée cliquable qui porte ce libellé — celle qui est `draggable`. */
const rowOf = (label: string): HTMLElement =>
  within(table()).getByText(label).closest("[draggable=\"true\"]") as HTMLElement;

/** Les libellés de premier niveau, dans l'ordre où la page les rend. */
const order = () =>
  [...table().querySelectorAll('[draggable="true"]')]
    .map((el) => el.querySelector("span[title]")?.textContent)
    .filter(Boolean);

/** `dataTransfer` minimal : jsdom n'en fournit aucun. */
const transfer = () => ({ setData: () => {}, effectAllowed: "", dropEffect: "" });

/** Le geste complet, déposé sur la moitié `edge` de la ligne visée. */
function dragOnto(source: HTMLElement, target: HTMLElement, edge: "before" | "after") {
  fireEvent.pointerDown(source, { pointerType: "mouse", button: 0 });
  const start = new Event("dragstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "dataTransfer", { value: transfer() });
  fireEvent(source, start);

  /* jsdom ne met rien en page et rend des rectangles NULS : sans cette hauteur,
     les deux moitiés de la ligne se confondent et « déposer avant » n'existerait
     pas — le test passerait en ne vérifiant jamais qu'un seul bord. */
  target.getBoundingClientRect = () => ({ top: 0, height: 40 }) as DOMRect;

  /* `MouseEvent` et non `fireEvent.dragOver` : jsdom ne connaît pas `DragEvent`,
     testing-library retombe alors sur un `Event` nu et le `clientY` demandé
     n'arrive JAMAIS au gestionnaire — qui lisait `undefined` et choisissait
     toujours le même bord. */
  const over = new MouseEvent("dragover", {
    bubbles: true, cancelable: true, clientY: edge === "before" ? 5 : 35,
  });
  Object.defineProperty(over, "dataTransfer", { value: transfer() });
  fireEvent(target, over);

  fireEvent.drop(target);
}

afterEach(() => { cleanup(); cloudStore.clear(); });

describe("Page Comptes — réordonner la liste à la souris", () => {
  it("fait passer un compte autonome au-dessus d'une firme", () => {
    renderPage();
    // L'ordre naturel met les firmes en premier.
    expect(order()).toEqual(["Topstep", "Interactive Brokers"]);

    dragOnto(rowOf("Interactive Brokers"), rowOf("Topstep"), "before");
    expect(order()).toEqual(["Interactive Brokers", "Topstep"]);
  });

  it("descend une firme sous un compte quand on vise la moitié basse", () => {
    /* L'autre bord : sans lui, un tri qui ne saurait qu'insérer « avant »
       passerait le test précédent sans qu'on s'en aperçoive. */
    renderPage();
    dragOnto(rowOf("Topstep"), rowOf("Interactive Brokers"), "after");
    expect(order()).toEqual(["Interactive Brokers", "Topstep"]);
  });

  it("retient l'ordre d'un chargement à l'autre", () => {
    const { unmount } = renderPage();
    dragOnto(rowOf("Interactive Brokers"), rowOf("Topstep"), "before");

    unmount();
    renderPage();
    expect(order()).toEqual(["Interactive Brokers", "Topstep"]);
  });

  it("n'attrape pas la ligne quand le geste part d'une de ses commandes", () => {
    /* Le chevron déplie, les icônes modifient et suppriment : tirer dessus ne
       doit rien déplacer, sinon aucun de ces boutons n'est plus utilisable. */
    renderPage();
    const source = rowOf("Interactive Brokers");
    fireEvent.pointerDown(source.querySelector("button") as HTMLElement, { pointerType: "mouse", button: 0 });

    const start = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(start, "dataTransfer", { value: transfer() });
    fireEvent(source, start);
    expect(start.defaultPrevented).toBe(true);
  });

  it("laisse la fiche s'ouvrir quand on clique sans rien glisser", () => {
    /* Le garde-fou anti-glissé ne doit pas manger le clic ordinaire : c'est la
       seule façon d'ouvrir un compte depuis la liste. */
    const setSelected = vi.fn();
    render(
      <AccountsPage
        accounts={ACCOUNTS} trades={[]} firms={FIRMS} archivedMeta={{}}
        setAccounts={() => {}} setFirms={() => {}} setArchivedMeta={() => {}}
        setPage={() => {}} setSelectedAccountDetailId={setSelected} setSelectedFirmId={() => {}}
      />
    );
    // Le clic part du nom : il remonte à la zone de navigation de la ligne.
    fireEvent.click(within(rowOf("Interactive Brokers")).getByText("Interactive Brokers"));
    expect(setSelected).toHaveBeenCalledWith("a2");
  });
});
