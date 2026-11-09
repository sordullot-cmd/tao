import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

/* Les lectures croisées du tableau de bord : P&L par note, émotions positives
   contre négatives, confluences gagnantes, winrate par type de trade. */
vi.mock("@/lib/contexts/AppContext", () => ({
  useApp: () => ({ tradesLoading: false, trades: [], tradesByAccount: [], accounts: [] }),
}));
// Seule la note passe par useCloudState sur cette page : on la sert directement.
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(k === "tao_trade_rating" ? { t1: "A", t2: "F" } : d);
    return [v, setV, true];
  },
}));
vi.mock("@/lib/hooks/useTradeNotes", () => ({
  useTradeNotes: () => ({ notes: {}, setNote: async () => {} }),
}));
vi.mock("@/lib/hooks/useDailySessionNotes", () => ({
  useDailySessionNotes: () => ({ notes: {}, setNote: async () => {} }),
}));

import { t } from "@/lib/i18n";
import DashboardPage from "@/components/pages/DashboardPage";

const TRADES = [
  { id: "t1", date: "2026-10-05T10:00:00", symbol: "NQ", pnl: 300, direction: "LONG", entry: 1, exit: 2 },
  { id: "t2", date: "2026-10-06T10:00:00", symbol: "NQ", pnl: -100, direction: "SHORT", entry: 1, exit: 2 },
  { id: "t3", date: "2026-10-07T10:00:00", symbol: "NQ", pnl: 50, direction: "BUY", entry: 1, exit: 2 },
];

/** La carte qui porte ce titre. */
const card = (title: string) => screen.getByRole("heading", { name: title }).parentElement!.parentElement!;

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem("tao_emotion_tags", JSON.stringify({ t1: ["calm"], t2: ["fomo"], t3: ["calm", "revenge"] }));
  localStorage.setItem("tao_trade_entry_tags", JSON.stringify({ t1: ["fvg"], t2: ["ob"], t3: ["fvg"] }));
  localStorage.setItem("tao_trade_liquidity_tags", JSON.stringify({ t1: ["pdhpdl"], t2: ["pdhpdl"] }));
  localStorage.setItem("tao_trade_timeframe", JSON.stringify({ t1: "M5" }));
});

describe("lectures croisées du tableau de bord", () => {
  it("réserve la carte Impacts aux émotions", () => {
    render(<DashboardPage trades={TRADES} />);
    const c = card(t("dash.impacts"));
    expect(within(c).queryByRole("button", { name: t("dash.entryType") })).toBeNull();
    expect(within(c).queryByRole("button", { name: t("dash.liquidity") })).toBeNull();
    expect(within(c).queryByRole("button", { name: t("dash.timeframe") })).toBeNull();
    expect(within(card(t("dash.winRateByType"))).getByRole("button", { name: t("dash.entryType") })).toBeTruthy();
  });

  it("range le P&L par note, de A à F, avec les trades sans note à part", () => {
    render(<DashboardPage trades={TRADES} />);
    const rows = within(card(t("dash.pnlByGrade"))).getAllByText((_, n) => ["A", "F", t("dash.unrated")].includes(n?.textContent ?? "") && n?.children.length === 0)
      .map(n => n.textContent);
    expect(rows).toEqual(["A", "F", t("dash.unrated")]);
  });

  it("compare émotions positives et négatives, un trade mêlé comptant des deux côtés", () => {
    render(<DashboardPage trades={TRADES} />);
    const c = card(t("dash.emotionValence"));
    expect(within(c).getByText(/^\+\D*350\.00$/)).toBeTruthy();   // calme : t1 + t3
    expect(within(c).getByText(/^-\D*50\.00$/)).toBeTruthy();    // fomo + revenge : t2 + t3
  });

  it("ne liste que les confluences gagnantes", () => {
    render(<DashboardPage trades={TRADES} />);
    const c = card(t("dash.payingConfluences"));
    expect(within(c).getByText("FVG + PDH/PDL + M5")).toBeTruthy();
    expect(within(c).queryByText("OB + PDH/PDL")).toBeNull();
  });

  it("bascule le winrate par type de trade sur la direction", () => {
    render(<DashboardPage trades={TRADES} />);
    const c = card(t("dash.winRateByType"));
    fireEvent.click(within(c).getByRole("button", { name: t("dash.direction") }));
    expect(within(c).getByText(t("common.long"))).toBeTruthy();
    expect(within(c).getByText("100%")).toBeTruthy();       // t1 et t3, tous deux gagnants
  });

  it("recalcule les KPI et la courbe sur la semaine civile choisie", () => {
    const trades = [
      { id: "old", date: "2026-09-30T10:00:00", symbol: "NQ", pnl: 1000 },
      ...TRADES,
    ];
    const { container } = render(<DashboardPage trades={trades} />);
    const kpis = () => screen.getAllByText(t("dash.kpi.netPnL"))[0].parentElement!.parentElement!;

    expect(within(kpis()).getByText(t("dash.kpi.winRate")).parentElement?.textContent).toContain("75.0%");
    expect(within(kpis()).getByText(t("dash.kpi.tradingDays")).parentElement?.textContent).toContain("4");
    expect(within(kpis()).getByText(t("dash.kpi.profitFactor")).parentElement?.textContent).toContain("13.50");

    fireEvent.click(screen.getByRole("button", { name: "1S" }));

    expect(within(kpis()).getByText(t("dash.kpi.winRate")).parentElement?.textContent).toContain("66.7%");
    expect(within(kpis()).getByText(t("dash.kpi.tradingDays")).parentElement?.textContent).toContain("3");
    expect(within(kpis()).getByText(t("dash.kpi.profitFactor")).parentElement?.textContent).toContain("3.50");
    expect(kpis().textContent).toContain("250.00");
    expect(container.querySelector('svg path[stroke-linecap="round"]')).not.toBeNull();
  });
});
