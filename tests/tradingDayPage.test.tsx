import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { getLocalDateString } from "@/lib/dateUtils";

/* Relais entre instances, comme le vrai hook (cf. CLAUDE.md) : la page lit les
   listes de tâches sous la même clé que la page Discipline. */
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

vi.mock("@/lib/hooks/useTradeNotes", () => ({
  useTradeNotes: () => ({ notes: {}, setNote: async () => {} }),
}));
vi.mock("@/lib/hooks/useDailySessionNotes", () => ({
  useDailySessionNotes: () => ({ notes: {}, setNote: async () => {} }),
}));
/* Le recap est le panneau de la page Trades en mode `panelOnly` ; il a ses
   propres tests. Ici on vérifie seulement CE qu'on lui confie, et que ses
   écritures remontent jusqu'au compteur. */
vi.mock("@/components/pages/TradesPage", () => ({
  default: (p: { panelOnly?: boolean; panelTrade?: { _children?: { id: string }[] }; onRecapChange?: (e: unknown) => void; onPanelClose?: () => void }) => (
    <aside aria-label="Trade panel" data-panel-only={String(!!p.panelOnly)} data-executions={String(p.panelTrade?._children?.length ?? 1)}>
      <button type="button" onClick={() => p.onRecapChange?.({ type: "note", tradeId: "x1", text: "Entrée propre" })}>write note</button>
      <button type="button" onClick={() => p.onPanelClose?.()}>close</button>
    </aside>
  ),
}));

import TradingDayPage, { DayFlowSummary } from "@/components/pages/TradingDayPage";

const DAY = getLocalDateString();
const trades = [
  { id: "x1", date: DAY, symbol: "NQ", direction: "long", entry: 21000, exit: 21010, entryTime: "09:31:00", account_id: "A", pnl: 100, quantity: 1 },
  { id: "x2", date: DAY, symbol: "NQ", direction: "long", entry: 21000, exit: 21010, entryTime: "09:31:10", account_id: "B", pnl: 90, quantity: 1 },
  { id: "y",  date: DAY, symbol: "ES", direction: "short", entry: 5800, exit: 5805, entryTime: "10:02:00", account_id: "A", pnl: -40, quantity: 2 },
];
const accounts = [{ id: "A", name: "Standard 50K" }, { id: "B", name: "Standard 100K" }];

const tab = (name: RegExp) => screen.getByRole("tab", { name });
const panel = () => screen.getByRole("tabpanel");
/** Ouvre une étape sans la refermer si elle l'est déjà (la première à faire s'ouvre seule). */
const openStep = (name: RegExp) => {
  if (tab(name).getAttribute("aria-selected") !== "true") fireEvent.click(tab(name));
};

describe("Page Journée", () => {
  beforeEach(() => {
    cloudStore.clear();
    localStorage.clear();
    // `clear()` emporte aussi la langue épinglée par tests/setup.ts.
    localStorage.setItem("tao_lang", "en");
  });

  it("aligne trois étapes, sans pré-market, et ouvre la première à faire", () => {
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    expect(screen.getAllByRole("tab").map(t => t.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/^Discipline/),
      expect.stringMatching(/^Trade recap/),
      expect.stringMatching(/^Day wrap/),
    ]);
    expect(tab(/Discipline/)).toHaveAttribute("aria-selected", "true");
    // La carte de recap annonce déjà ce qui reste : NQ copié sur deux comptes ne compte qu'une fois.
    expect(screen.getByText("2 not recapped")).toBeInTheDocument();
  });

  it("fusionne les copies d'un ordre et ouvre le panneau Trades à droite de la liste", () => {
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    fireEvent.click(tab(/Trade recap/));
    const recaps = within(panel()).getAllByRole("button", { name: /Recap trade/ });
    expect(recaps).toHaveLength(2);
    // La base commune des listes : en-tête « Heure », et une ligne fusionnée annonce ses comptes.
    expect(within(panel()).getByText("Heure")).toBeInTheDocument();
    expect(within(panel()).getAllByText("2 comptes").length).toBeGreaterThan(0);

    fireEvent.click(recaps[0]);
    const side = screen.getByRole("complementary", { name: "Trade panel" });
    expect(side).toHaveAttribute("data-panel-only", "true");
    expect(side).toHaveAttribute("data-executions", "2");
    fireEvent.click(within(side).getByRole("button", { name: "write note" }));
    expect(screen.getByText("1 not recapped")).toBeInTheDocument();
    fireEvent.click(within(side).getByRole("button", { name: "close" }));
    expect(screen.queryByRole("complementary", { name: "Trade panel" })).toBeNull();
  });

  it("crée un set d'objectifs dans une modale et le note sur les trades", () => {
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    openStep(/Discipline/);
    fireEvent.click(within(panel()).getByRole("button", { name: /Create goal set/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText(/Prop firm/), { target: { value: "Funded" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Add a metric/ }));
    fireEvent.change(within(dialog).getByLabelText("Metric"), { target: { value: "profit_target" } });
    // Vu d'un compte, la journée fait +60 (100 − 40) : sous un seuil de 50, c'est tenu.
    fireEvent.change(within(dialog).getByLabelText("Threshold"), { target: { value: "50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(panel()).getByText("Funded")).toBeInTheDocument();
    // La métrique en titre, la règle dessous — sans répéter le nom de la métrique.
    const line = within(panel()).getByText(/^≥ .*50.* · today$/).parentElement!.parentElement!;
    expect(within(line).getByText("Net P&L")).toBeInTheDocument();
    // Tenu, mais un P&L peut encore redescendre d'ici la clôture : « on track », pas « met ».
    expect(within(line).getByText("on track")).toBeInTheDocument();
  });

  it("ajoute un set existant depuis un menu, sans modale", () => {
    cloudStore.set("tao_trading_day", {
      goalSets: [
        { id: "a", name: "Mon plan", goals: [] },
        { id: "b", name: "Scalp NY", goals: [{ id: "g", type: "max_trades", value: 1 }] },
      ],
      appliedSetIds: ["a"],
    });
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    openStep(/Discipline/);
    // Un set est déjà là : l'ajout n'est plus qu'un mot à côté du titre.
    const add = within(panel()).getByRole("button", { name: /Add goal set/ });
    expect(add).toHaveTextContent(/^Add$/);
    fireEvent.click(add);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /Scalp NY/ }));
    expect(within(panel()).getByText("≤ 1 · today")).toBeInTheDocument();
    expect(within(panel()).getByText("broken")).toBeInTheDocument();
  });

  it("choisit la comparaison et la période du set dans la modale", () => {
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    openStep(/Discipline/);
    fireEvent.click(within(panel()).getByRole("button", { name: /Create goal set/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText(/Prop firm/), { target: { value: "Volume" } });
    // La période est à côté du nom, une pour tout le set.
    fireEvent.change(within(dialog).getByLabelText("Period"), { target: { value: "day" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Add a metric/ }));
    fireEvent.change(within(dialog).getByLabelText("Metric"), { target: { value: "max_trades" } });
    fireEvent.change(within(dialog).getByLabelText("Comparison"), { target: { value: "gte" } });
    fireEvent.change(within(dialog).getByLabelText("Threshold"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(within(panel()).getByText("≥ 2 · today")).toBeInTheDocument();
    const saved = cloudStore.get("tao_trading_day") as { goalSets: { name: string; goals: { op?: string }[] }[] };
    expect(saved.goalSets.find(gs => gs.name === "Volume")?.goals[0].op).toBe("gte");
  });

  it("supprime un set depuis le menu d'ajout, plus depuis sa carte", () => {
    cloudStore.set("tao_trading_day", {
      goalSets: [{ id: "a", name: "Mon plan", goals: [] }, { id: "b", name: "Scalp NY", goals: [] }],
      appliedSetIds: ["a"],
    });
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    openStep(/Discipline/);
    expect(within(panel()).queryByRole("button", { name: "Delete set" })).toBeNull();
    fireEvent.click(within(panel()).getByRole("button", { name: /Add goal set/ }));
    fireEvent.click(screen.getByRole("button", { name: /Delete set — Scalp NY/ }));
    const saved = cloudStore.get("tao_trading_day") as { goalSets: { id: string }[] };
    expect(saved.goalSets.map(gs => gs.id)).toEqual(["a"]);
  });

  it("note les objectifs sur un compte : une copie sur deux comptes reste un trade, au P&L d'un compte", () => {
    cloudStore.set("tao_trading_day", {
      goalSets: [{ id: "a", name: "Funded", goals: [
        { id: "n", type: "max_trades", value: 2 },
        { id: "p", type: "profit_target", value: 60, op: "lte" },
      ] }],
      appliedSetIds: ["a"],
    });
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    openStep(/Discipline/);
    // Deux trades (NQ copié compte pour un) ; P&L 100 − 40 = 60, pas 190 − 40.
    const count = within(panel()).getByText("≤ 2 · today").parentElement!.parentElement!;
    expect(within(count).getByText("2")).toBeInTheDocument();
    expect(within(count).getByText("/ 2")).toBeInTheDocument();
    const pnl = within(panel()).getByText(/^≤ .*60.* · today$/).parentElement!.parentElement!;
    // La règle (« ≤ 60 »), puis la mesure face à son seuil (« 60 / 60 ») — jamais 150.
    expect(within(pnl).getAllByText(/60/)).toHaveLength(3);
    expect(within(pnl).queryByText(/150/)).toBeNull();
  });

  it("valide la discipline sur les tâches seules, même avec un objectif franchi", () => {
    cloudStore.set("tao_trading_day", {
      goalSets: [{ id: "a", name: "Strict", goals: [{ id: "n", type: "max_trades", value: 1 }] }],
      appliedSetIds: ["a"],
    });
    cloudStore.set("tao_routine_rules", { lists: [{ id: "l", name: "Prop", strategyId: null, items: [{ id: "r1", label: "Stop posé" }] }], activeId: "l" });
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    openStep(/Discipline/);
    fireEvent.click(within(panel()).getByRole("checkbox", { name: /Stop posé/ }));
    // Objectif « ≤ 1 trade » franchi (deux trades), mais la seule tâche est cochée.
    expect(within(panel()).getByText("broken")).toBeInTheDocument();
    const card = tab(/Discipline/);
    // Une étape faite porte la même pastille ovale que les autres, en vert.
    expect(within(card).getByText("Done")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("Goal broken");
  });

  it("liste sans les noter les objectifs plus longs qu'une journée", () => {
    cloudStore.set("tao_trading_day", {
      goalSets: [{ id: "w", name: "Consistent week", goals: [{ id: "g", type: "profit_target", value: 2000, period: "week" }] }],
      appliedSetIds: ["w"],
    });
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    openStep(/Discipline/);
    expect(within(panel()).getByText("1 not evaluated")).toBeInTheDocument();
    expect(within(panel()).getByText("not evaluated")).toBeInTheDocument();
  });

  it("range une note sous la journée, note la journée et la clôture", () => {
    render(<TradingDayPage trades={trades} accounts={accounts} />);
    fireEvent.click(tab(/Day wrap/));
    // Pas de bouton : le journal s'enregistre à la frappe, dans une seule note du jour.
    const journal = within(panel()).getByPlaceholderText(/CPI candle/);
    fireEvent.change(journal, { target: { value: "Patience" } });
    fireEvent.change(journal, { target: { value: "Patience payée." } });
    expect(within(panel()).queryByRole("button", { name: "Save note" })).toBeNull();
    const saved = cloudStore.get("tao_notes") as { content: string; journalDate: string }[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ content: "Patience payée.", journalDate: DAY, dayJournal: true });
    expect(journal).toHaveValue("Patience payée.");

    fireEvent.click(within(panel()).getByRole("radio", { name: "D" }));
    expect(screen.getByText("Graded D")).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("button", { name: "Sign off the day" }));
    expect(within(panel()).getByRole("button", { name: "Reopen the day" })).toBeInTheDocument();
    expect(within(panel()).getByRole("radio", { name: "D" })).toBeDisabled();
  });

  it("enchaîne les étapes du tableau de bord : rien ne se valide après une étape ouverte", () => {
    // Sans trade, le recap n'attend rien — mais les tâches ne sont pas cochées.
    render(<DayFlowSummary trades={[]} />);
    const chain = within(screen.getByRole("group", { name: "Daily flow" })).getAllByRole("button");
    expect(chain).toHaveLength(3);
    expect(chain[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("button", { name: /^Trade recap — Locked/ })).toBeInTheDocument();
  });

  it("déplie sous la chaîne les trades à recap, et chaque rond mène à la page", () => {
    const onOpen = vi.fn();
    render(<DayFlowSummary trades={trades} onOpen={onOpen} />);
    // NQ copié sur deux comptes reste un trade : deux lignes à relire, pas trois.
    const row = screen.getByRole("button", { name: /Trades to recap/ });
    expect(row).toHaveTextContent("0 of 2 recapped");
    expect(row).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: /^ES/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^Day wrap/ }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
