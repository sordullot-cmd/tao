/**
 * La carte « contrat » d'un compte de prop firm.
 *
 * Ce qui est sous test, c'est ce qu'elle REFUSE d'annoncer : pas de bouton de
 * passage tant que les objectifs ne sont pas tenus, aucun bouton du tout quand
 * l'évaluation est perdue, et un montant retirable qui ne compte jamais deux
 * fois ce qui est déjà sorti.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ContractCard from "@/components/ui/contractCard";
import { resolveAccountRules } from "@/lib/propFirmRules";
import {
  evalProgress, normalizeContract, payoutState, resolveObjectives,
} from "@/lib/accountContracts";

const RULES = resolveAccountRules("apex", 50_000);

/** La carte telle que la page la monte : tout est déjà calculé en amont. */
const renderCard = (
  { funded = false, contract = {}, trades = [] as Array<Record<string, unknown>>, capital = 50_000 } = {},
  handlers: Record<string, unknown> = {},
) => {
  const c = normalizeContract(contract);
  const objectives = resolveObjectives(c, RULES);
  return render(
    <ContractCard
      funded={funded}
      sizeLabel="Éval 50k"
      firmName="Apex"
      capital={capital}
      contract={c}
      objectives={objectives}
      rules={RULES}
      progress={evalProgress(trades, objectives)}
      payout={payoutState(trades, c, objectives)}
      onPatch={vi.fn()}
      onAddPayout={vi.fn()}
      onRemovePayout={vi.fn()}
      onPassFunded={vi.fn()}
      {...handlers}
    />
  );
};

describe("visage « évaluation »", () => {
  it("refuse le passage tant que la cible n'est pas atteinte, et dit ce qu'il manque", () => {
    renderCard({ trades: [{ date: "2026-09-01", pnl: 1_000 }] });
    expect(screen.getByRole("button", { name: /Marquer comme financé/ })).toBeDisabled();
    // Le chiffre mis en avant est ce qui RESTE à faire, pas ce qui est acquis.
    expect(screen.getByText("$2,000.00 à faire")).toBeTruthy();
  });

  it("ouvre le passage dès que tout est tenu, et le dit", () => {
    const onPassFunded = vi.fn();
    renderCard({ trades: [{ date: "2026-09-01", pnl: 3_200 }] }, { onPassFunded });
    fireEvent.click(screen.getByRole("button", { name: /Marquer comme financé/ }));
    expect(onPassFunded).toHaveBeenCalled();
  });

  it("annonce la valeur du compte à ne pas franchir : le capital moins le drawdown", () => {
    // Compte encore en perte, donc jamais de pic : 50k − 2 500 de drawdown Apex.
    renderCard({ trades: [{ date: "2026-09-01", pnl: -300 }] });
    expect(screen.getByText("$47,500.00")).toBeTruthy();
  });

  it("fait monter ce plancher avec le pic quand le drawdown est trailing", () => {
    /* Apex mesure son drawdown depuis le PIC : à +2 000, le plancher est déjà
       remonté de 2 000. L'afficher figé à 47 500 donnerait une réserve qui
       n'existe plus. */
    renderCard({ trades: [{ date: "2026-09-01", pnl: 2_000 }, { date: "2026-09-02", pnl: -800 }] });
    expect(screen.getByText("$49,500.00")).toBeTruthy();
    // La marge restante descend en ligne de détail, sans case à cocher : elle
    // se consomme, elle ne s'atteint pas.
    expect(screen.getByText("$1,700.00")).toBeTruthy();
  });

  it("pose le gain du moment sur la barre, à l'endroit où il en est", () => {
    renderCard({ trades: [{ date: "2026-09-01", pnl: 1_200 }] });
    expect(screen.getByText("+$1,200.00")).toBeTruthy();
  });

  it("ne propose plus rien quand la limite est franchie — il n'y a rien à rattraper", () => {
    renderCard({ trades: [{ date: "2026-09-01", pnl: -3_000 }] });
    expect(screen.queryByRole("button", { name: /financé/ })).toBeNull();
    expect(screen.getByText(/Limite dépassée/)).toBeTruthy();
  });
});

describe("visage « payouts »", () => {
  const financé = { fundedAt: "2026-09-01" };
  /* Apex demande 8 jours tradés : deux séances ne suffisent pas, et c'est ce
     que la carte doit expliquer au lieu d'afficher un montant retirable. */
  const deuxSeances = [
    { date: "2026-09-02", pnl: 1_000 },
    { date: "2026-09-03", pnl: 500 },
  ];

  it("annonce ce qui bloque plutôt qu'un montant qu'on ne peut pas demander", () => {
    renderCard({ funded: true, contract: financé, trades: deuxSeances });
    // Le chiffre héros reste le solde, mais il n'est PAS annoncé « à retirer ».
    expect(screen.queryByText(/à retirer/)).toBeNull();
    expect(screen.getByText(/Encore 6 jours tradés/)).toBeTruthy();
  });

  it("ne compte pas deux fois un retrait déjà encaissé", () => {
    renderCard({
      funded: true,
      trades: deuxSeances,
      contract: {
        ...financé,
        payoutDays: 0,
        payouts: [{ id: "p1", date: "2026-09-04", amount: 1_000 }],
      },
    });
    // Gagné 1 500, sorti 1 000 : il reste 500 à demander, pas 1 500.
    expect(screen.getByText("$500.00 à retirer")).toBeTruthy();
    expect(screen.getByText(/\$1,000\.00 déjà retirés/)).toBeTruthy();
  });

  it("dit franchement qu'aucun retrait n'a encore été enregistré", () => {
    renderCard({ funded: true, contract: financé, trades: deuxSeances });
    expect(screen.getByText("Aucun retrait enregistré.")).toBeTruthy();
  });
});
