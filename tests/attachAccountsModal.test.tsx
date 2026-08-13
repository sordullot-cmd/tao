import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/* La modale écrit en base : seul `updateTradingAccount` est simulé, tout le
   reste du module reste réel (ACCOUNT_SIZES, readFirmHeroMode…) — la modale
   partage son fichier avec les autres modales de comptes, qui les utilisent. */
const updateTradingAccount = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/propFirms", async () => {
  const actual = await vi.importActual<typeof import("@/lib/propFirms")>("@/lib/propFirms");
  return { ...actual, updateTradingAccount };
});

const { AttachAccountsModal } = await import("@/components/modals/AccountModals");

const FIRM = { id: "f1", name: "Topstep", platform: "tradovate", brand: "topstep" };
const OTHER_FIRM = { id: "f2", name: "Apex", platform: "tradovate", brand: "apex" };

const ACCOUNTS = [
  { id: "a1", name: "Compte libre", account_type: "eval", eval_account_size: "50k", firm_id: null, broker: "Rithmic" },
  { id: "a2", name: "Déjà chez Topstep", account_type: "funded", eval_account_size: "50k", firm_id: "f1", broker: "Tradovate" },
  { id: "a3", name: "Chez Apex", account_type: "eval", eval_account_size: "100k", firm_id: "f2", broker: "Tradovate" },
];

const renderModal = (firm = FIRM) => {
  const onAttached = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <AttachAccountsModal
      firm={firm}
      accounts={ACCOUNTS}
      firms={[FIRM, OTHER_FIRM]}
      onClose={onClose}
      onAttached={onAttached}
    />
  );
  return { onAttached, onClose, ...utils };
};

describe("AttachAccountsModal", () => {
  beforeEach(() => {
    updateTradingAccount.mockClear();
    // Les libellés attendus ci-dessous sont ceux du dictionnaire FR ; sans ça
    // l'app retombe sur l'anglais.
    localStorage.setItem("tr4de_lang", "fr");
  });

  /* Le cœur de la fonctionnalité : la firme est le point de départ, on y récupère
     un compte qui existait déjà — la modale du compte n'est plus le seul chemin. */
  it("ne propose que les comptes qui ne sont pas déjà dans la firme", () => {
    renderModal();
    expect(screen.getByText("Compte libre")).toBeTruthy();
    expect(screen.getByText("Chez Apex")).toBeTruthy();
    expect(screen.queryByText("Déjà chez Topstep")).toBeNull();
  });

  it("rattache le compte choisi et aligne son broker sur la plateforme de la firme", async () => {
    const { onAttached, onClose } = renderModal();
    fireEvent.click(screen.getByText("Compte libre"));
    fireEvent.click(screen.getByRole("button", { name: /rattacher 1 compte/i }));

    await waitFor(() => expect(updateTradingAccount).toHaveBeenCalledTimes(1));
    expect(updateTradingAccount).toHaveBeenCalledWith("a1", { firm_id: "f1", broker: "Tradovate" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onAttached).toHaveBeenCalledWith({
      updated: [expect.objectContaining({ id: "a1", firm_id: "f1", broker: "Tradovate" })],
    });
  });

  /* Rattacher ne doit pas EFFACER une donnée saisie : une firme sans plateforme
     réglée laisse le broker du compte tel quel. */
  it("ne touche pas au broker quand la firme n'a pas de plateforme", async () => {
    renderModal({ ...FIRM, platform: null } as typeof FIRM);
    fireEvent.click(screen.getByText("Compte libre"));
    fireEvent.click(screen.getByRole("button", { name: /rattacher 1 compte/i }));

    await waitFor(() => expect(updateTradingAccount).toHaveBeenCalledTimes(1));
    expect(updateTradingAccount).toHaveBeenCalledWith("a1", { firm_id: "f1" });
  });

  /* Déplacer un compte d'une firme à l'autre est le même geste, mais il ne doit
     jamais être implicite : l'origine est nommée et le déplacement récapitulé. */
  it("annonce le déplacement d'un compte qui appartient à une autre firme", () => {
    renderModal();
    // La ligne dit d'où vient le compte, avant même de le cocher.
    expect(screen.getByText(/Actuellement chez Apex/)).toBeTruthy();
    fireEvent.click(screen.getByText("Chez Apex"));
    expect(screen.getByText(/changent de firme/i)).toBeTruthy();
  });

  it("n'écrit rien tant qu'aucun compte n'est choisi", () => {
    renderModal();
    const cta = screen.getByRole("button", { name: /rattacher/i });
    expect(cta).toBeDisabled();
    fireEvent.click(cta);
    expect(updateTradingAccount).not.toHaveBeenCalled();
  });

  it("désélectionne au second clic", async () => {
    renderModal();
    const row = screen.getByText("Compte libre").closest('[role="checkbox"]')!;
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-checked", "true");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /rattacher/i })).toBeDisabled();
  });
});
