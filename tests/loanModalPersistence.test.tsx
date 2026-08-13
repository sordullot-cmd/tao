import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";

/* Reproduction du bug signalé : ajouter un crédit depuis la page Crédits ne
   gardait rien. On monte le VRAI useCloudState (pas de mock) : c'est lui qui
   était en cause — la persistance vivait dans l'updater de setState, jamais
   exécuté quand la modale se démonte juste après avoir enregistré. */

/* Pas d'utilisateur : le hook reste en localStorage seul. Le client Supabase est
   tout de même construit à l'import, d'où ce mock (pas de clés sous vitest). */
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }), upsert: async () => ({ error: null }) }) }),
  clearStaleSession: async () => {},
  isRefreshTokenError: () => false,
}));

vi.mock("@/lib/auth/supabaseAuthProvider", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, isAuthenticated: false, logout: async () => {} }),
}));

vi.mock("@/lib/bank/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/useBankAccounts")>()),
  useBankAccounts: () => ({
    configured: false, connections: [], accounts: [], loading: false, error: null, reload: () => {},
  }),
}));

import PatrimoineLiabilitiesPage from "@/components/pages/PatrimoineLiabilitiesPage";
import { PATRIMOINE_LOCAL_KEY } from "@/lib/patrimoine";

const stored = () => {
  const raw = localStorage.getItem(PATRIMOINE_LOCAL_KEY);
  return raw ? (JSON.parse(raw).assets ?? []) : [];
};

describe("Page Crédits — saisie d'un crédit", () => {
  beforeEach(() => localStorage.clear());

  it("enregistre le crédit alors que la modale se ferme dans la foulée", () => {
    render(<PatrimoineLiabilitiesPage setPage={() => {}} setSelectedAssetId={() => {}} />);

    fireEvent.click(
      Array.from(document.querySelectorAll("button")).find(b => /add|ajouter/i.test(b.textContent || ""))!,
    );

    const dialog = document.querySelector("[role=dialog]")!;
    const inputs = Array.from(dialog.querySelectorAll("input"));
    fireEvent.change(inputs[0], { target: { value: "Prêt immo" } });
    const montant = inputs.find(el => /^[0-9]/.test(el.getAttribute("placeholder") || ""));
    fireEvent.change(montant!, { target: { value: "150000" } });

    fireEvent.click(
      Array.from(dialog.querySelectorAll("button"))
        .find(b => /^(add|ajouter|save|enregistrer)/i.test((b.textContent || "").trim()))!,
    );

    // La modale s'est fermée : c'est précisément le moment où la saisie se
    // perdait. Elle doit être persistée quand même.
    expect(document.querySelector("[role=dialog]")).toBeNull();
    const assets = stored();
    expect(assets).toHaveLength(1);
    expect(assets[0].name).toBe("Prêt immo");
    expect(assets[0].type).toBe("loan");
    // Un crédit se range en négatif (convention de lib/patrimoine).
    expect(assets[0].balance).toBe(-150000);
    // Et il apparaît dans la liste sans recharger la page.
    expect(document.body.textContent).toContain("Prêt immo");
  });

  it("garde les conditions saisies depuis « compléter les conditions »", () => {
    localStorage.setItem(PATRIMOINE_LOCAL_KEY, JSON.stringify({
      assets: [{
        id: "l1", name: "Prêt auto", type: "loan", balance: -8000,
        institution: null, updatedAt: null, loan: null,
      }],
      history: [],
    }));

    render(<PatrimoineLiabilitiesPage setPage={() => {}} setSelectedAssetId={() => {}} />);

    // Le crédit est incomplet : la carte propose de compléter ses conditions.
    const complete = Array.from(document.querySelectorAll("button"))
      .find(b => /complete|complèt|compl[ée]ter/i.test(b.textContent || ""));
    expect(complete, "bouton « compléter les conditions » absent").toBeTruthy();
    fireEvent.click(complete!);

    const dialog = document.querySelector("[role=dialog]")!;
    const inputs = Array.from(dialog.querySelectorAll("input"));
    // Champs de l'échéancier, repérés par leur aria-label.
    const byLabel = (re: RegExp) =>
      inputs.find(el => re.test(el.getAttribute("aria-label") || ""));
    const rate = byLabel(/rate|taux/i);
    const payment = byLabel(/payment|mensualit/i);
    expect(rate, "champ taux absent").toBeTruthy();
    expect(payment, "champ mensualité absent").toBeTruthy();
    fireEvent.change(rate!, { target: { value: "3.4" } });
    fireEvent.change(payment!, { target: { value: "250" } });

    fireEvent.click(
      Array.from(dialog.querySelectorAll("button"))
        .find(b => /^(save|enregistrer)/i.test((b.textContent || "").trim()))!,
    );

    const asset = stored()[0];
    expect(asset.loan?.rate).toBe(3.4);
    expect(asset.loan?.payment).toBe(250);
  });
});
