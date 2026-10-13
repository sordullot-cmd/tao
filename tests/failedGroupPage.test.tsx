import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

/* La page du groupe « Comptes échoués » est celle d'une firme, sans ce qui
   agit sur une firme : ni réglages, ni ajout, ni suppression. */
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/hooks/useCloudState", () => ({
  useCloudState: (_k: string, _c: string, d: unknown) => {
    const [v, setV] = React.useState(d);
    return [v, setV, true];
  },
}));
vi.mock("@/components/modals/AccountModals", () => ({ PropFirmModal: () => null, AccountModal: () => null }));

import PropFirmDetailPage from "@/components/pages/PropFirmDetailPage";
import { t } from "@/lib/i18n";

const NONE: never[] = [];
const failed = [
  { id: "ko1", name: "Tombé 1", firm_id: "f1", account_type: "failed", eval_account_size: "50k" },
  { id: "ko2", name: "Tombé 2", firm_id: "f1", account_type: "failed", eval_account_size: "50k" },
];

describe("page du groupe des comptes en échec", () => {
  it("se présente comme le groupe, sans les actions d'une firme", () => {
    render(
      <PropFirmDetailPage
        firms={[{ id: "f1", name: "Topstep" }]}
        accounts={failed}
        trades={NONE}
        strategies={NONE}
        group={{ id: "group:failed", name: "Comptes échoués", accounts: failed }}
      />
    );
    expect(screen.getByRole("heading", { name: "Comptes échoués" })).toBeTruthy();
    expect(screen.queryByText(t("firms.editFirm"))).toBeNull();
    expect(screen.queryByRole("button", { name: t("firms.deleteFirm") })).toBeNull();
  });
});
