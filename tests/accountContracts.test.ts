/**
 * Le contrat d'un compte de prop firm.
 *
 * Deux choses sont sous test, et ce sont les deux qui se calculaient faux :
 * le DRAWDOWN, qui ne se mesure pas pareil selon la firme, et le SOLDE
 * RETIRABLE, qui n'est pas le P&L — un retrait déjà encaissé ne peut pas être
 * retiré deux fois.
 */

import { describe, it, expect } from "vitest";
import { resolveAccountRules } from "@/lib/propFirmRules";
import {
  accountAxis, contractOf, evalProgress, normalizeContract, normalizeStore, payoutState,
  payoutsByAccount, resolveObjectives, withContract, withPayout, withoutPayout,
} from "@/lib/accountContracts";

const tr = (date: string, pnl: number, time = "10:00") => ({ date, exit_time: time, pnl });
const EMPTY = normalizeContract({});

/** Les objectifs d'un compte 50k sans firme connue : repli 6 % / 5 %. */
const plain = (over: Record<string, unknown> = {}) =>
  resolveObjectives(normalizeContract(over), resolveAccountRules(null, 50_000));

describe("barème des firmes", () => {
  it("prend la grille de la firme plutôt que le repli en pourcentage", () => {
    // Apex 50k : 2 500 de drawdown, là où 5 % en donnerait 2 500 aussi — mais
    // sur un 100k la grille dit 3 000 quand le repli dirait 5 000.
    expect(resolveAccountRules("apex", 100_000)).toMatchObject({ target: 6_000, maxDD: 3_000, source: "firm" });
    expect(resolveAccountRules(null, 100_000)).toMatchObject({ target: 6_000, maxDD: 5_000, source: "default" });
  });

  it("dit que le drawdown d'Apex et de Topstep suit le pic, pas celui de FTMO", () => {
    expect(resolveAccountRules("apex", 50_000).trailing).toBe(true);
    expect(resolveAccountRules("topstep", 50_000).trailing).toBe(true);
    expect(resolveAccountRules("ftmo", 100_000).trailing).toBe(false);
  });

  it("met la grille à l'échelle d'une taille absente du catalogue", () => {
    // 75k chez Apex : entre le 50k et le 100k, personne ne l'a écrit.
    const r = resolveAccountRules("apex", 75_000);
    expect(r.target).toBe(4_500);
    expect(r.source).toBe("firm");
  });

  it("ne prête à personne le barème d'une voisine", () => {
    expect(resolveAccountRules("tradeify", 50_000).source).toBe("default");
  });
});

describe("progression d'une évaluation", () => {
  const parcours = [tr("2026-09-01", 2_000), tr("2026-09-02", -800), tr("2026-09-03", 1_900)];

  it("mesure le drawdown depuis le PIC quand la firme le veut ainsi", () => {
    // +2 000 puis -800 : le trailing a mangé 800, le statique rien du tout —
    // le cumul n'est jamais repassé sous zéro.
    const trailing = evalProgress(parcours, plain({ maxDD: 2_500 }));
    expect(trailing.ddUsed).toBe(0);
    const apex = resolveObjectives(EMPTY, resolveAccountRules("apex", 50_000));
    expect(evalProgress(parcours, apex).ddUsed).toBe(800);
  });

  it("n'annonce le passage que si la cible ET les jours minimum sont tenus", () => {
    const atteint = plain({ target: 3_000, minDays: 3 });
    expect(evalProgress(parcours, atteint).passed).toBe(true);
    expect(evalProgress(parcours, plain({ target: 3_000, minDays: 5 })).passed).toBe(false);
    expect(evalProgress(parcours, plain({ target: 9_000, minDays: 3 })).passed).toBe(false);
  });

  it("distingue une limite franchie d'un objectif pas encore atteint", () => {
    const perdu = evalProgress([tr("2026-09-01", -3_000)], plain({ target: 3_000, maxDD: 2_500 }));
    expect(perdu.breached).toBe(true);
    expect(perdu.passed).toBe(false);
    expect(evalProgress([tr("2026-09-01", 500)], plain({ target: 3_000 })).breached).toBe(false);
  });

  it("compte la pire JOURNÉE, pas le pire trade", () => {
    const journee = [tr("2026-09-01", -400, "09:00"), tr("2026-09-01", 300, "14:00")];
    expect(evalProgress(journee, plain({ dailyLoss: 350 })).worstDay).toBe(-100);
  });
});

describe("l'axe du compte", () => {
  const apex = resolveObjectives(EMPTY, resolveAccountRules("apex", 50_000));
  const axeDe = (trades: Array<{ date: string; exit_time?: string; pnl: number }>) =>
    accountAxis(50_000, evalProgress(trades, apex), apex);

  it("pose le plancher à « capital moins drawdown » tant qu'aucun pic n'a été fait", () => {
    const axe = axeDe([tr("2026-09-01", -300)]);
    expect(axe.floor).toBe(47_500);
    expect(axe.ceiling).toBe(53_000);
    expect(axe.current).toBe(49_700);
  });

  it("fait monter le plancher avec le pic quand le drawdown suit", () => {
    // +2 000 puis -800 : le pic reste à 2 000, le plancher a suivi.
    expect(axeDe([tr("2026-09-01", 2_000), tr("2026-09-02", -800)]).floor).toBe(49_500);
  });

  it("laisse le plancher immobile quand le drawdown est statique", () => {
    const ftmo = resolveObjectives(EMPTY, resolveAccountRules("ftmo", 100_000));
    const axe = accountAxis(100_000, evalProgress([tr("2026-09-01", 4_000)], ftmo), ftmo);
    expect(axe.floor).toBe(90_000);
  });

  it("retombe en P&L pur quand la taille du compte n'est pas renseignée", () => {
    const axe = accountAxis(null, evalProgress([tr("2026-09-01", 500)], apex), apex);
    expect(axe.start).toBe(0);
    expect(axe.floor).toBe(-2_000);
  });
});

describe("retraits d'un compte financé", () => {
  const financé = normalizeContract({ fundedAt: "2026-09-01" });
  const trades = [tr("2026-08-20", 5_000), tr("2026-09-02", 1_000), tr("2026-09-03", 500)];

  it("ignore ce qui a été gagné AVANT le passage financé", () => {
    expect(payoutState(trades, financé, plain()).earned).toBe(1_500);
  });

  it("retire du disponible ce qui a déjà été sorti", () => {
    const avec = normalizeContract({
      fundedAt: "2026-09-01",
      payouts: [{ id: "p1", date: "2026-09-04", amount: 1_000 }],
    });
    const st = payoutState(trades, avec, plain());
    expect(st.withdrawn).toBe(1_000);
    expect(st.available).toBe(500);
  });

  it("bloque tant que les jours de la firme ne sont pas faits, et dit lesquels", () => {
    const st = payoutState(trades, financé, plain({ payoutDays: 5 }));
    expect(st.eligible).toBe(false);
    expect(st.available).toBe(0);
    expect(st.blocker).toBe("Encore 3 jours tradés");
  });

  it("ne compte comme gagnante qu'une journée au-dessus du seuil de la firme", () => {
    const topstep = resolveObjectives(
      normalizeContract({ fundedAt: "2026-09-01" }),
      resolveAccountRules("topstep", 50_000),
    );
    // Topstep : une journée ne compte qu'à partir de 200 $. La séance à +500 y
    // est, celle à +1 000 aussi ; il en manque donc trois sur cinq.
    const st = payoutState(trades, financé, topstep);
    expect(st.winDays).toBe(2);
    expect(st.blocker).toBe("Encore 3 jours gagnants");
  });

  it("ne propose rien à retirer quand le compte est en perte", () => {
    const st = payoutState([tr("2026-09-02", -400)], financé, plain());
    expect(st.available).toBe(0);
    expect(st.blocker).toBe("Rien à retirer pour le moment");
  });
});

describe("magasin des contrats", () => {
  it("laisse le barème de la firme là où l'utilisateur n'a rien posé", () => {
    const obj = resolveObjectives(normalizeContract({ target: 4_000 }), resolveAccountRules("apex", 50_000));
    expect(obj.target).toBe(4_000);
    expect(obj.maxDD).toBe(2_500);
    expect(obj.source).toBe("custom");
  });

  it("range les retraits du plus récent au plus ancien et jette ceux sans date", () => {
    const c = normalizeContract({
      payouts: [
        { id: "a", date: "2026-07-01", amount: 100 },
        { id: "b", date: "2026-09-01", amount: 200 },
        { id: "c", amount: 300 },
      ],
    });
    expect(c.payouts.map(p => p.id)).toEqual(["b", "a"]);
  });

  it("ajoute et retire un retrait sans toucher aux autres comptes", () => {
    const s1 = withPayout({}, "acc1", { date: "2026-09-01", amount: 500 });
    const s2 = withContract(s1, "acc2", { target: 1_000 });
    const id = s1.acc1.payouts[0].id;
    const s3 = withoutPayout(s2, "acc1", id);
    expect(s3.acc1.payouts).toEqual([]);
    expect(s3.acc2.target).toBe(1_000);
  });

  it("rend un contrat vide pour un compte inconnu plutôt que rien du tout", () => {
    expect(contractOf({}, "jamais-vu").payouts).toEqual([]);
    expect(normalizeStore(null)).toBeTypeOf("object");
  });
});

describe("vue d'ensemble des payouts", () => {
  it("ne rend un état que pour les comptes financés, et retranche leurs retraits", () => {
    const accounts = [
      { id: "f1", account_type: "funded", eval_account_size: "50k" },
      { id: "e1", account_type: "eval", eval_account_size: "50k" },
    ];
    const trades = [
      { account_id: "f1", date: "2026-09-02", pnl: 2_000 },
      { account_id: "e1", date: "2026-09-02", pnl: 9_000 },
    ];
    const store = withPayout({}, "f1", { date: "2026-09-03", amount: 800 });
    const map = payoutsByAccount(accounts, trades, store, new Map());
    expect(map.get("f1")?.available).toBe(1_200);
    expect(map.has("e1")).toBe(false);
  });
});
