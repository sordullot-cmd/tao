import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";

/* Quand seuls des comptes en échec ont tradé, le tableau de bord et le
   calendrier montrent des zéros — pas l'invitation à importer un premier trade. */
vi.mock("@/lib/contexts/AppContext", () => ({
  useApp: () => ({ tradesLoading: false, trades: [], tradesByAccount: [], accounts: [] }),
}));
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(d);
    return [v, setV, true];
  },
}));

import { t } from "@/lib/i18n";
import CalendarPage from "@/components/pages/CalendarPage";
import DashboardPage from "@/components/pages/DashboardPage";

beforeEach(() => cleanup());

describe("comptes en échec seuls", () => {
  it("garde l'invitation à importer quand personne n'a jamais tradé", () => {
    render(<CalendarPage trades={[]} />);
    expect(screen.getByText(t("cal.noTradesImported"))).toBeTruthy();
  });

  it("affiche la grille du calendrier à zéro", () => {
    render(<CalendarPage trades={[]} onlyFailedTrades />);
    expect(screen.queryByText(t("cal.noTradesImported"))).toBeNull();
  });

  it("affiche le tableau de bord à zéro au lieu de l'écran vide", () => {
    render(<DashboardPage trades={[]} />);
    expect(screen.getByText(t("dash.noTrades"))).toBeTruthy();
    cleanup();
    render(<DashboardPage trades={[]} onlyFailedTrades />);
    expect(screen.queryByText(t("dash.noTrades"))).toBeNull();
  });
});
